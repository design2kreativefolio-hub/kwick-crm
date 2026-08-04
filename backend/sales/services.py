"""Client ID generator: "KF" + 4 random digits + 2 random uppercase letters."""
import random
import string

from .models import Client


def generate_client_id() -> str:
    while True:
        candidate = (
            "KF"
            + "".join(random.choices(string.digits, k=4))
            + "".join(random.choices(string.ascii_uppercase, k=2))
        )
        if not Client.objects.filter(client_id=candidate).exists():
            return candidate
