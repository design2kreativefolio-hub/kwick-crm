"""Recompute every lead's score (e.g. after deploying the score feature)."""
from django.core.management.base import BaseCommand

from bd import scoring


class Command(BaseCommand):
    help = "Re-score all Business Development leads."

    def handle(self, *args, **opts):
        n = scoring.refresh_all(open_only=False)
        self.stdout.write(self.style.SUCCESS(f"Scored {n} lead(s)."))
