import getpass

from django.core.management.base import BaseCommand

from accounts.models import Role, StaffProfile, User, UserStatus


class Command(BaseCommand):
    help = "Create the first (and only) superadmin (company owner)."

    def add_arguments(self, parser):
        parser.add_argument("--email", help="Superadmin email")
        parser.add_argument("--password", help="Superadmin password (omit to be prompted)")
        parser.add_argument("--name", default="", help="Full name")

    def handle(self, *args, **opts):
        email = opts.get("email") or input("Superadmin email: ")
        if User.objects.filter(email__iexact=email).exists():
            self.stderr.write(self.style.ERROR(f"User {email} already exists."))
            return
        password = opts.get("password") or getpass.getpass("Superadmin password: ")

        user = User.objects.create_user(
            email=email,
            password=password,
            full_name=opts.get("name", ""),
            role=Role.SUPERADMIN,
            status=UserStatus.ACTIVE,
        )
        user.is_staff = True  # allow Django admin access for the owner
        user.save(update_fields=["is_staff"])
        StaffProfile.objects.get_or_create(user=user)

        self.stdout.write(self.style.SUCCESS(f"Superadmin created: {email}"))
        self.stdout.write(
            "Employees can self-register at /register — they'll land awaiting your "
            "approval. Grant them access to HR, Sales, Renewals or Reports from "
            "inside each module's own page once approved."
        )
