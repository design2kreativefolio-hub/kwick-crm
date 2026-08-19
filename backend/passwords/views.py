from rest_framework import status, viewsets
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.views import APIView

from accounts.models import Module
from common.permissions import HasModuleAccess, IsActive, IsSuperadmin
from common.throttles import VaultPinThrottle

from .crypto import decrypt_secret
from .models import PasswordAccessLog, PasswordEntry
from .serializers import (
    PasswordAccessLogSerializer,
    PasswordEntrySerializer,
    PasswordRevealSerializer,
    VaultPinChangeSerializer,
    VaultUnlockSerializer,
)
from .services import (
    change_vault_pin,
    is_vault_unlocked,
    log_password_access,
    verify_pin,
    vault_unlock_ttl,
)


class VaultUnlockedMixin:
    """Require an active vault unlock session before password data access."""

    def _require_unlock(self, request):
        if is_vault_unlocked(request.user):
            return None
        return Response(
            {"detail": "Enter the vault PIN to continue.", "code": "vault_locked"},
            status=status.HTTP_403_FORBIDDEN,
        )


class PasswordEntryViewSet(VaultUnlockedMixin, viewsets.ModelViewSet):
    serializer_class = PasswordEntrySerializer
    permission_classes = [HasModuleAccess]
    required_module = Module.PASSWORDS
    filterset_fields = ["client", "platform"]
    search_fields = ["client_name", "platform", "username", "comment"]

    def get_queryset(self):
        return PasswordEntry.objects.select_related("client", "created_by").all()

    def list(self, request, *args, **kwargs):
        blocked = self._require_unlock(request)
        if blocked:
            return blocked
        response = super().list(request, *args, **kwargs)
        log_password_access(user=request.user, action=PasswordAccessLog.Action.LISTED)
        return response

    def retrieve(self, request, *args, **kwargs):
        blocked = self._require_unlock(request)
        if blocked:
            return blocked
        return super().retrieve(request, *args, **kwargs)

    def perform_create(self, serializer):
        entry = serializer.save(created_by=self.request.user, updated_by=self.request.user)
        log_password_access(
            user=self.request.user,
            action=PasswordAccessLog.Action.CREATED,
            entry=entry,
        )

    def create(self, request, *args, **kwargs):
        blocked = self._require_unlock(request)
        if blocked:
            return blocked
        return super().create(request, *args, **kwargs)

    def perform_update(self, serializer):
        entry = serializer.save(updated_by=self.request.user)
        log_password_access(
            user=self.request.user,
            action=PasswordAccessLog.Action.UPDATED,
            entry=entry,
        )

    def update(self, request, *args, **kwargs):
        blocked = self._require_unlock(request)
        if blocked:
            return blocked
        return super().update(request, *args, **kwargs)

    def partial_update(self, request, *args, **kwargs):
        blocked = self._require_unlock(request)
        if blocked:
            return blocked
        return super().partial_update(request, *args, **kwargs)

    def perform_destroy(self, instance):
        log_password_access(
            user=self.request.user,
            action=PasswordAccessLog.Action.DELETED,
            entry=instance,
        )
        instance.delete()

    def destroy(self, request, *args, **kwargs):
        blocked = self._require_unlock(request)
        if blocked:
            return blocked
        return super().destroy(request, *args, **kwargs)

    @action(detail=True, methods=["get"])
    def reveal(self, request, pk=None):
        blocked = self._require_unlock(request)
        if blocked:
            return blocked
        entry = self.get_object()
        try:
            password = decrypt_secret(entry.password_encrypted)
        except ValueError:
            return Response({"detail": "Stored password could not be decrypted."}, status=500)
        log_password_access(
            user=request.user,
            action=PasswordAccessLog.Action.REVEALED,
            entry=entry,
        )
        return Response(PasswordRevealSerializer({"password": password}).data)


class VaultUnlockView(APIView):
    permission_classes = [HasModuleAccess]
    required_module = Module.PASSWORDS
    throttle_classes = [VaultPinThrottle]

    def get_throttles(self):
        if self.request.method != "POST":
            return []
        return super().get_throttles()

    def get(self, request):
        return Response(
            {
                "unlocked": is_vault_unlocked(request.user),
                "ttl_seconds": vault_unlock_ttl(request.user),
            }
        )

    def post(self, request):
        ser = VaultUnlockSerializer(data=request.data)
        ser.is_valid(raise_exception=True)
        ok, message = verify_pin(request.user, ser.validated_data["pin"])
        if not ok:
            return Response({"detail": message}, status=status.HTTP_400_BAD_REQUEST)
        log_password_access(user=request.user, action=PasswordAccessLog.Action.UNLOCKED)
        return Response({"unlocked": True, "ttl_seconds": vault_unlock_ttl(request.user)})


class VaultPinView(APIView):
    permission_classes = [IsSuperadmin]

    def post(self, request):
        ser = VaultPinChangeSerializer(data=request.data)
        ser.is_valid(raise_exception=True)
        ok, message = change_vault_pin(
            actor=request.user,
            current_pin=ser.validated_data["current_pin"],
            new_pin=ser.validated_data["new_pin"],
        )
        if not ok:
            return Response({"detail": message}, status=status.HTTP_400_BAD_REQUEST)
        return Response({"detail": "Vault PIN updated."})


class PasswordAccessLogView(APIView):
    permission_classes = [IsSuperadmin]

    def get(self, request):
        logs = PasswordAccessLog.objects.select_related("user")[:300]
        return Response(PasswordAccessLogSerializer(logs, many=True).data)
