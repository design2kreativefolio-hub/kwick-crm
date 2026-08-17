from django.core.management.base import BaseCommand, CommandError

from common.maintenance import (
    allowlist_emails,
    maintenance_enabled,
    set_maintenance_enabled,
)


class Command(BaseCommand):
    help = "Turn maintenance mode on or off, or print the current status."

    def add_arguments(self, parser):
        parser.add_argument(
            "action",
            choices=["on", "off", "status"],
            help="on = lock the site to MAINTENANCE_ALLOW_EMAIL; off = everyone can use it again",
        )

    def handle(self, *args, **opts):
        action = opts["action"]
        emails = sorted(allowlist_emails())
        if action == "status":
            state = "ON" if maintenance_enabled() else "OFF"
            allow = ", ".join(emails) if emails else "(not set — maintenance cannot engage)"
            self.stdout.write(f"Maintenance: {state}")
            self.stdout.write(f"Allowlist:   {allow}")
            return
        if action == "on":
            try:
                set_maintenance_enabled(True)
            except ValueError as exc:
                raise CommandError(str(exc)) from exc
            self.stdout.write(self.style.SUCCESS("Maintenance ON — only the allowlisted account can sign in."))
            self.stdout.write("Allowlist: " + ", ".join(emails))
            return
        set_maintenance_enabled(False)
        self.stdout.write(self.style.SUCCESS("Maintenance OFF — everyone can use the site again."))
