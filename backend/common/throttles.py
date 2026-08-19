from rest_framework.throttling import AnonRateThrottle, UserRateThrottle


class AuthAnonThrottle(AnonRateThrottle):
    """Login / register / forgot-password."""

    scope = "auth"


class VaultPinThrottle(UserRateThrottle):
    scope = "vault_pin"
