import getpass

from django.core.management.base import BaseCommand
from django.utils import timezone

from accounts.models import InviteCode, Role, StaffProfile, User, UserStatus


class Command(BaseCommand):
    help = "Create the first active manager (company owner) and print a starter employee invite code."

    def add_arguments(self, parser):
        parser.add_argument("--email", help="Manager email")
        parser.add_argument("--password", help="Manager password (omit to be prompted)")
        parser.add_argument("--name", default="", help="Full name")

    def handle(self, *args, **opts):
        email = opts.get("email") or input("Manager email: ")
        if User.objects.filter(email__iexact=email).exists():
            self.stderr.write(self.style.ERROR(f"User {email} already exists."))
            return
        password = opts.get("password") or getpass.getpass("Manager password: ")

        user = User.objects.create_user(
            email=email,
            password=password,
            full_name=opts.get("name", ""),
            role=Role.MANAGER,
            status=UserStatus.ACTIVE,
        )
        user.is_staff = True  # allow Django admin access for the owner
        user.save(update_fields=["is_staff"])
        StaffProfile.objects.get_or_create(user=user)

        _, raw = InviteCode.issue(
            issued_by=user,
            role_for=Role.EMPLOYEE,
            expires_at=timezone.now() + timezone.timedelta(days=7),
        )
        self.stdout.write(self.style.SUCCESS(f"Manager created: {email}"))
        self.stdout.write(self.style.WARNING(f"Starter EMPLOYEE invite code (7 days): {raw}"))
        self.stdout.write(
            "Employees can self-register with this code and await your approval, "
            "or you can add them directly via HR (Add Staff) instead — both work."
        )
