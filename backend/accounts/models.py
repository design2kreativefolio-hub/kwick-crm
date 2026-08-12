from django.contrib.auth.models import AbstractBaseUser, BaseUserManager, PermissionsMixin
from django.db import models

from common.models import TimeStampedModel


class Role(models.TextChoices):
    SUPERADMIN = "superadmin", "Superadmin"
    EMPLOYEE = "employee", "Employee"


class Module(models.TextChoices):
    """Grantable business areas. Parent keys (`hr`, `sales`) still work and
    imply every child; sub-keys let the superadmin open only one page
    (e.g. Documents without Staff)."""

    HR = "hr", "HR"
    HR_DOCUMENTS = "hr_documents", "HR · Documents"
    HR_STAFF = "hr_staff", "HR · Staff"
    SALES = "sales", "Sales"
    SALES_CLIENTS = "sales_clients", "Sales · Clients"
    SALES_PROPOSALS = "sales_proposals", "Sales · Proposals"
    SALES_INVOICES = "sales_invoices", "Sales · Invoices"
    RENEWALS = "renewals", "Renewals"
    REPORTS = "reports", "Reports"


# Parent → child grants. A parent grant satisfies every child check; any child
# grant also satisfies a parent-level check (e.g. dashboard "has HR").
MODULE_CHILDREN = {
    Module.HR: (Module.HR_DOCUMENTS, Module.HR_STAFF),
    Module.SALES: (Module.SALES_CLIENTS, Module.SALES_PROPOSALS, Module.SALES_INVOICES),
}
MODULE_PARENT = {
    child: parent for parent, children in MODULE_CHILDREN.items() for child in children
}


def grant_keys_for(module: str) -> set[str]:
    """DB grant values that satisfy access to `module`."""
    keys = {module}
    parent = MODULE_PARENT.get(module)
    if parent:
        keys.add(parent)
    keys.update(MODULE_CHILDREN.get(module, ()))
    return keys


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
    # Set when a manager permanently removes personal details. The User row
    # stays so tasks/projects/messages keep their historical assignee links.
    purged_at = models.DateTimeField(null=True, blank=True)

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
    def is_purged(self):
        return self.purged_at is not None

    @property
    def can_login(self):
        # Employee cannot log in until status=active (spec §4 acceptance).
        return (
            self.status == UserStatus.ACTIVE
            and self.is_active
            and self.purged_at is None
        )

    def has_module_access(self, module: str) -> bool:
        if self.is_superadmin:
            return True
        return self.module_access.filter(module__in=grant_keys_for(module)).exists()


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
    module = models.CharField(max_length=32, choices=Module.choices)
    granted_by = models.ForeignKey(
        User, on_delete=models.SET_NULL, null=True, related_name="+"
    )

    class Meta:
        unique_together = ("user", "module")
        ordering = ["module", "user__full_name"]

    def __str__(self):
        return f"{self.user.email} -> {self.module}"
