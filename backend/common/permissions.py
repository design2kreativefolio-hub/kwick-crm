"""
Role-based DRF permissions. Every access rule in the spec is enforced here,
server-side — the frontend nav only *hides* things, it never gates them.

There is only ever one superadmin (Rajathi). Everyone else is an employee;
the superadmin extends specific employees into specific business modules
(HR, Sales, Renewals, Reports) via accounts.models.ModuleAccess instead of
promoting them to a second role.
"""
from rest_framework.permissions import SAFE_METHODS, BasePermission


def is_superadmin(user) -> bool:
    return bool(user and user.is_authenticated and getattr(user, "role", None) == "superadmin")


def is_employee(user) -> bool:
    return bool(user and user.is_authenticated and getattr(user, "role", None) == "employee")


def has_module_access(user, module: str) -> bool:
    """Superadmin always passes; otherwise needs a grant for `module`, its
    parent (e.g. `hr` covers `hr_documents`), or any child when checking a
    parent (e.g. any HR sub-page counts as having HR)."""
    if is_superadmin(user):
        return True
    if not (user and user.is_authenticated):
        return False
    from accounts.models import grant_keys_for

    return user.module_access.filter(module__in=grant_keys_for(module)).exists()


class IsActive(BasePermission):
    """User must be authenticated and status=active."""

    message = "Account is not active."

    def has_permission(self, request, view):
        return bool(
            request.user
            and request.user.is_authenticated
            and getattr(request.user, "status", None) == "active"
        )


class IsSuperadmin(IsActive):
    """Superadmin-only endpoints that aren't grantable per-module (approving
    signups, managing module grants themselves, ...)."""

    message = "Superadmin role required."

    def has_permission(self, request, view):
        return super().has_permission(request, view) and is_superadmin(request.user)


class IsSuperadminOrReadOnly(IsActive):
    """Everyone active can read; only the superadmin can write."""

    def has_permission(self, request, view):
        if not super().has_permission(request, view):
            return False
        if request.method in SAFE_METHODS:
            return True
        return is_superadmin(request.user)


class IsOwnerOrSuperadmin(IsActive):
    """
    Object-level: the superadmin sees/modifies everything; other users only
    their own. The owning field name is read from `view.owner_field` (default 'user').
    """

    def has_object_permission(self, request, view, obj):
        if is_superadmin(request.user):
            return True
        owner_field = getattr(view, "owner_field", "user")
        return getattr(obj, owner_field, None) == request.user


class HasModuleAccess(IsActive):
    """
    Gate for the 4 grantable business modules. The superadmin always passes;
    anyone else needs an explicit ModuleAccess grant for `view.required_module`
    (set on the view, e.g. `required_module = "hr"`).
    """

    message = "You don't have access to this module."

    def has_permission(self, request, view):
        if not super().has_permission(request, view):
            return False
        module = getattr(view, "required_module", None)
        return bool(module) and has_module_access(request.user, module)
