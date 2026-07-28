"""
Role-based DRF permissions. Every access rule in the spec is enforced here,
server-side — the frontend nav only *hides* things, it never gates them.
"""
from rest_framework.permissions import SAFE_METHODS, BasePermission


def is_manager(user) -> bool:
    return bool(user and user.is_authenticated and getattr(user, "role", None) == "manager")


def is_employee(user) -> bool:
    return bool(user and user.is_authenticated and getattr(user, "role", None) == "employee")


class IsActive(BasePermission):
    """User must be authenticated and status=active."""

    message = "Account is not active."

    def has_permission(self, request, view):
        return bool(
            request.user
            and request.user.is_authenticated
            and getattr(request.user, "status", None) == "active"
        )


class IsManager(IsActive):
    """Manager-only endpoints (HR, Sales, Renewals, Kanban, Reports, ...)."""

    message = "Manager role required."

    def has_permission(self, request, view):
        return super().has_permission(request, view) and is_manager(request.user)


class IsManagerOrReadOnly(IsActive):
    """Everyone active can read; only managers can write."""

    def has_permission(self, request, view):
        if not super().has_permission(request, view):
            return False
        if request.method in SAFE_METHODS:
            return True
        return is_manager(request.user)


class IsOwnerOrManager(IsActive):
    """
    Object-level: managers see/modify everything; other users only their own.
    The owning field name is read from `view.owner_field` (default 'user').
    """

    def has_object_permission(self, request, view, obj):
        if is_manager(request.user):
            return True
        owner_field = getattr(view, "owner_field", "user")
        return getattr(obj, owner_field, None) == request.user
