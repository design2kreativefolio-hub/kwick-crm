"""Daily project-delivery reminder scan (spec follow-up: a project's
delivery date nags the assigned employee(s) daily, prioritized by how close
or overdue it is, until the project is marked completed or the date moves
out of the lead window). Scheduled via Celery Beat — see config/celery.py.

evaluate_project_delivery() is also called directly (not just from the daily
scan) right after a manager/employee edits a project, so the reminder
reflects the new date/status instantly instead of waiting for tomorrow.
"""
from datetime import date, timedelta

from celery import shared_task

# Shorter lead window than the 30-day staff-renewal one — projects here are
# explicitly short-term (spec follow-up), so a week's notice is the relevant
# horizon.
LEAD_DAYS = 7


def delivery_object_ref(project_id: int) -> str:
    return f"project_delivery:{project_id}"


def evaluate_project_delivery(project) -> None:
    from notifications.services import refresh_daily_reminder, stop_recurring_reminder

    from .models import Project

    object_ref = delivery_object_ref(project.id)
    today = date.today()
    lead_cutoff = today + timedelta(days=LEAD_DAYS)
    assignees = list(project.members.all())

    if (
        project.delivery_date
        and project.delivery_date <= lead_cutoff
        and project.status != Project.Status.COMPLETED
        and assignees
    ):
        overdue = project.delivery_date <= today
        refresh_daily_reminder(
            source="project",
            title=f"Delivery {'overdue' if overdue else 'due soon'}: {project.name}",
            body=(
                f"\"{project.name}\" was due {project.delivery_date.strftime('%b %d, %Y')}. "
                "Update the project once it's delivered."
                if overdue
                else f"\"{project.name}\" is due {project.delivery_date.strftime('%b %d, %Y')}."
            ),
            object_ref=object_ref,
            users=assignees,
        )
    else:
        # No delivery date, out of the lead window, completed, or unassigned
        # — nothing to nag about (also the safety net if an edit didn't
        # already stop it).
        stop_recurring_reminder(object_ref=object_ref)


@shared_task
def check_project_deliveries():
    from .models import Project

    for project in Project.objects.exclude(delivery_date__isnull=True).prefetch_related("members"):
        evaluate_project_delivery(project)
