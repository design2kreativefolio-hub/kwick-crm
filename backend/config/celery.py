import os

from celery import Celery
from celery.schedules import crontab

os.environ.setdefault("DJANGO_SETTINGS_MODULE", "config.settings")

app = Celery("kwick")
app.config_from_object("django.conf:settings", namespace="CELERY")
app.autodiscover_tasks()

# Periodic tasks — synced into django_celery_beat's DatabaseScheduler on startup.
app.conf.beat_schedule = {
    # Renewal lead-window scan + overdue flip — once a day at 07:00 UTC.
    "scan-renewals-daily": {
        "task": "renewals.tasks.scan_renewals",
        "schedule": crontab(hour=7, minute=0),
    },
    # Re-fire recurring-until-actioned reminders (pending leaves/tickets) daily at 08:00 UTC.
    "refire-recurring-reminders-daily": {
        "task": "notifications.tasks.refire_recurring_reminders",
        "schedule": crontab(hour=8, minute=0),
    },
    # Nag the manager daily about overdue staff visa/insurance/ILOE renewals,
    # resetting to unread each run so "seen today" isn't "resolved forever".
    "check-staff-renewals-daily": {
        "task": "hr.tasks.check_staff_renewals",
        "schedule": crontab(hour=8, minute=5),
    },
}


@app.task(bind=True, ignore_result=True)
def debug_task(self):
    print(f"Request: {self.request!r}")
