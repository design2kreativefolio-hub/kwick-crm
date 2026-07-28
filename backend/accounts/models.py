import hashlib
import secrets

from django.contrib.auth.models import AbstractBaseUser, BaseUserManager, PermissionsMixin
from django.db import models
from django.utils import timezone

from common.models import TimeStampedModel


class Role(models.TextChoices):
    MANAGER = "manager", "Manager"
    EMPLOYEE = "employee", "Employee"


class UserStatus(models.TextChoices):
    PENDING = "pending", "Pending"
    AWAITING_APPROVAL = "awaiting_approval", "Awaiting approval"
    ACTIVE = "active", "Active"
    DISABLED = "disabled", "Disabled"


class UserManager(BaseUserManager):
    use_in_migrations = True

    def _create_user(self, email, password, **extra):
        if not email:
            raise ValueError("Users must have an email address.")
        email = self.normalize_email(email)
        user = self.model(email=email, **extra)
        user.set_password(password)
        user.save(using=self._db)
        return user

    def create_user(self, email, password=None, **extra):
        extra.setdefault("role", Role.EMPLOYEE)
        extra.setdefault("status", UserStatus.PENDING)
        extra.setdefault("is_staff", False)
        extra.setdefault("is_superuser", False)
        return self._create_user(email, password, **extra)

    def create_superuser(self, email, password=None, **extra):
        extra.update(
            {
                "role": Role.MANAGER,
                "status": UserStatus.ACTIVE,
                "is_staff": True,
                "is_superuser": True,
            }
        )
        return self._create_user(email, password, **extra)


class User(AbstractBaseUser, PermissionsMixin, TimeStampedModel):
    """Custom user keyed by email, with role + approval status."""

    email = models.EmailField(unique=True)
    full_name = models.CharField(max_length=150, blank=True)
    role = models.CharField(max_length=20, choices=Role.choices, default=Role.EMPLOYEE)
    status = models.CharField(
        max_length=20, choices=UserStatus.choices, default=UserStatus.PENDING
    )
    is_active = models.BooleanField(default=True)  # Django-level gate (disabled -> False)
    is_staff = models.BooleanField(default=False)  # Django admin access

    objects = UserManager()

    USERNAME_FIELD = "email"
    REQUIRED_FIELDS = []

    class Meta:
        ordering = ["email"]

    def __str__(self):
        return f"{self.email} ({self.role})"

    @property
    def is_manager(self):
        return self.role == Role.MANAGER

    @property
    def can_login(self):
        # Employee cannot log in until status=active (spec §4 acceptance).
        return self.status == UserStatus.ACTIVE and self.is_active


class StaffProfile(TimeStampedModel):
    """1:1 extension of User (spec §4 / §5)."""

    user = models.OneToOneField(User, on_delete=models.CASCADE, related_name="profile")
    job_title = models.CharField(max_length=120, blank=True)
    department = models.CharField(max_length=120, blank=True)
    date_joined = models.DateField(null=True, blank=True)
    phone = models.CharField(max_length=40, blank=True)
    avatar_url = models.URLField(blank=True)

    def __str__(self):
        return f"Profile<{self.user.email}>"


class InviteCode(TimeStampedModel):
    """Single-use, hashed invite code issued by a manager (spec §4)."""

    code_hash = models.CharField(max_length=64, unique=True, db_index=True)
    issued_by = models.ForeignKey(
        User, on_delete=models.SET_NULL, null=True, related_name="issued_invites"
    )
    role_for = models.CharField(max_length=20, choices=Role.choices, default=Role.EMPLOYEE)
    expires_at = models.DateTimeField()
    used_by = models.ForeignKey(
        User, on_delete=models.SET_NULL, null=True, blank=True, related_name="used_invite"
    )
    used_at = models.DateTimeField(null=True, blank=True)

    @staticmethod
    def hash_code(raw_code: str) -> str:
        return hashlib.sha256(raw_code.encode("utf-8")).hexdigest()

    @classmethod
    def issue(cls, *, issued_by, role_for, expires_at):
        """Create a code, returning (instance, raw_code). Only the hash is stored."""
        raw = secrets.token_urlsafe(9)  # ~12 chars
        instance = cls.objects.create(
            code_hash=cls.hash_code(raw),
            issued_by=issued_by,
            role_for=role_for,
            expires_at=expires_at,
        )
        return instance, raw

    @property
    def is_used(self):
        return self.used_by_id is not None

    @property
    def is_expired(self):
        return timezone.now() >= self.expires_at

    def is_valid_for(self, role: str) -> bool:
        return (not self.is_used) and (not self.is_expired) and self.role_for == role

    def mark_used(self, user):
        self.used_by = user
        self.used_at = timezone.now()
        self.save(update_fields=["used_by", "used_at", "updated_at"])
