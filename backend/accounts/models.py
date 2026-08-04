from django.contrib.auth.models import AbstractBaseUser, BaseUserManager, PermissionsMixin
from django.db import models

from common.models import TimeStampedModel


class Role(models.TextChoices):
    SUPERADMIN = "superadmin", "Superadmin"
    EMPLOYEE = "employee", "Employee"


class Module(models.TextChoices):
    """The business modules a superadmin can hand out to specific employees
    one at a time, in place of the old blanket manager role."""

    HR = "hr", "HR"
    SALES = "sales", "Sales"
    RENEWALS = "renewals", "Renewals"
    REPORTS = "reports", "Reports"


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
                "role": Role.SUPERADMIN,
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
    def is_superadmin(self):
        return self.role == Role.SUPERADMIN

    @property
    def can_login(self):
        # Employee cannot log in until status=active (spec §4 acceptance).
        return self.status == UserStatus.ACTIVE and self.is_active

    def has_module_access(self, module: str) -> bool:
        return self.is_superadmin or self.module_access.filter(module=module).exists()


class StaffProfile(TimeStampedModel):
    """1:1 extension of User (spec §4 / §5)."""

    user = models.OneToOneField(User, on_delete=models.CASCADE, related_name="profile")
    job_title = models.CharField(max_length=120, blank=True)
    department = models.CharField(max_length=120, blank=True)
    date_joined = models.DateField(null=True, blank=True)
    phone = models.CharField(max_length=40, blank=True)
    avatar_url = models.URLField(blank=True)
    # Manager-set renewal reminders, visible read-only on the employee's own
    # profile too.
    visa_renewal_date = models.DateField(null=True, blank=True)
    insurance_renewal_date = models.DateField(null=True, blank=True)
    iloe_renewal_date = models.DateField(null=True, blank=True)
    # HR record fields (spec follow-up).
    nationality = models.CharField(max_length=100, blank=True)
    emergency_contact_uae = models.CharField(max_length=40, blank=True)
    emergency_contact_relation = models.CharField(max_length=100, blank=True)
    home_country_address = models.TextField(blank=True)
    home_country_number = models.CharField(max_length=40, blank=True)

    def __str__(self):
        return f"Profile<{self.user.email}>"


class ModuleAccess(TimeStampedModel):
    """
    Superadmin-granted access to one normally superadmin-only module, for one
    employee. Replaces the old multi-manager role entirely — there is only
    ever one superadmin (Rajathi); everyone else registers as an employee and
    gets extended into specific modules (HR, Sales, Renewals, Reports) here,
    from a control inside that module's own page.
    """

    user = models.ForeignKey(User, on_delete=models.CASCADE, related_name="module_access")
    module = models.CharField(max_length=20, choices=Module.choices)
    granted_by = models.ForeignKey(
        User, on_delete=models.SET_NULL, null=True, related_name="+"
    )

    class Meta:
        unique_together = ("user", "module")
        ordering = ["module", "user__full_name"]

    def __str__(self):
        return f"{self.user.email} -> {self.module}"
