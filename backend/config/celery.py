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
    # Nag assigned employees daily about project delivery dates closing in
    # or overdue — same reset-to-unread pattern as the staff renewal check.
    "check-project-deliveries-daily": {
        "task": "projects.tasks.check_project_deliveries",
        "schedule": crontab(hour=8, minute=10),
    },
    # Calendar reminders: day-of high priority + 1-hour-before alerts.
    "calendar-reminder-alerts": {
        "task": "calendar_app.tasks.send_calendar_reminder_alerts",
        "schedule": crontab(minute="*/5"),
    },
    # EDITH chat history — drop threads inactive for 15+ days.
    "purge-old-ai-conversations-daily": {
        "task": "ai.tasks.purge_old_ai_conversations",
        "schedule": crontab(hour=3, minute=15),
    },
}


@app.task(bind=True, ignore_result=True)
def debug_task(self):
    print(f"Request: {self.request!r}")
