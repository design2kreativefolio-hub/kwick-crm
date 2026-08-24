from datetime import timedelta

from django.db.models import Q
from django.utils import timezone
from django.utils.dateparse import parse_date
from rest_framework import viewsets
from rest_framework.response import Response
from rest_framework.views import APIView

from common.permissions import IsActive
from notifications.services import notify_user

from .models import ManualReminder
from .serializers import ManualReminderSerializer
from .services import build_agenda, detect_meeting_url


class AgendaView(APIView):
    """GET /api/calendar/agenda?from=&to=&scope=

    Personal calendar (scope=self) shows the user's own tasks/reminders/todos
    plus every client's content-calendar item (company-wide). Superadmins also
    see every mini-project delivery date.
    """

    permission_classes = [IsActive]

    def get(self, request):
        today = timezone.localdate()
        dt_from = parse_date(request.query_params.get("from", "")) or today
        dt_to = parse_date(request.query_params.get("to", "")) or (today + timedelta(days=30))
        scope = request.query_params.get("scope", "self")
        items = build_agenda(user=request.user, dt_from=dt_from, dt_to=dt_to, scope=scope)
        return Response({"from": dt_from, "to": dt_to, "scope": scope, "items": items})


class ManualReminderViewSet(viewsets.ModelViewSet):
    serializer_class = ManualReminderSerializer
    permission_classes = [IsActive]

    def get_queryset(self):
        return (
            ManualReminder.objects.filter(
                Q(owner=self.request.user)
                | Q(assignees=self.request.user)
                | Q(visibility=ManualReminder.Visibility.COMPANY)
            )
            .distinct()
            .prefetch_related("assignees")
            .select_related("owner")
        )

    def perform_create(self, serializer):
        reminder = serializer.save(owner=self.request.user)
        meeting = reminder.meeting_url or detect_meeting_url(reminder.description or "")
        if meeting and not reminder.meeting_url:
            reminder.meeting_url = meeting
            reminder.save(update_fields=["meeting_url", "updated_at"])

        # Reminders stay separate from To-Dos (to-dos may still appear on the calendar agenda).
        recipients = {self.request.user}
        recipients.update(reminder.assignees.all())
        local_when = timezone.localtime(reminder.remind_at)
        body = f"Reminder for {local_when.strftime('%b %d, %Y at %I:%M %p')}"
        if reminder.description:
            body = f"{body}\n{reminder.description[:200]}"
        for user in recipients:
            notify_user(
                user=user,
                source="calendar",
                title=f"📌 {reminder.title}",
                body=body,
                object_ref=f"reminder:{reminder.id}",
            )

    def perform_update(self, serializer):
        was_done = serializer.instance.done
        reminder = serializer.save()
        meeting = reminder.meeting_url or detect_meeting_url(reminder.description or "")
        if meeting and reminder.meeting_url != meeting:
            reminder.meeting_url = meeting
            reminder.save(update_fields=["meeting_url", "updated_at"])

        # Advance recurring series after the current occurrence is completed.
        if (
            "done" in serializer.validated_data
            and reminder.done
            and not was_done
            and reminder.recurrence != ManualReminder.Recurrence.NONE
        ):
            from .services import next_occurrence

            nxt = next_occurrence(reminder.remind_at, reminder.recurrence)
            if nxt and (
                not reminder.recurrence_end
                or timezone.localtime(nxt).date() <= reminder.recurrence_end
            ):
                reminder.remind_at = nxt
                reminder.done = False
                reminder.done_at = None
                reminder.day_alert_sent = False
                reminder.hour_alert_sent = False
                reminder.save(
                    update_fields=[
                        "remind_at",
                        "done",
                        "done_at",
                        "day_alert_sent",
                        "hour_alert_sent",
                        "updated_at",
                    ]
                )