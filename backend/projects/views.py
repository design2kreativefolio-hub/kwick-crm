from rest_framework import status, viewsets
from rest_framework.decorators import action
from rest_framework.parsers import FormParser, JSONParser, MultiPartParser
from rest_framework.response import Response
from rest_framework.views import APIView
from django.shortcuts import get_object_or_404

from common.permissions import IsActive, IsSuperadminOrReadOnly
from common.services import log_activity
from notifications.services import notify_user
from sales.models import Client
from tasks.services import combine_due_datetime, notify_task_assignment, notify_task_edit

from .models import Artwork, ArtworkType, CategoryCode, ContentCalendarItem, Project, ProjectClient, ProjectUpdate
from .serializers import (
    ArtworkSerializer,
    ArtworkTypeSerializer,
    CategoryCodeSerializer,
    ClientDirectorySerializer,
    ContentCalendarItemSerializer,
    ProjectClientSerializer,
    ProjectSerializer,
    ProjectUpdateSerializer,
)
from .services import build_artwork_id, sync_mini_project_task


class ProjectViewSet(viewsets.ModelViewSet):
    """Projects are company-wide: every active user can see, create, edit,
    and delete. `members` is who is assigned (notifications + personal
    dashboard), not who can view."""

    serializer_class = ProjectSerializer
    permission_classes = [IsActive]
    filterset_fields = ["status", "client"]
    search_fields = ["name"]
    parser_classes = [MultiPartParser, FormParser, JSONParser]

    def get_queryset(self):
        # Do not select_related("work_task"): missing reverse OneToOne rows
        # (and a lagging migration) 500 the entire list page.
        return Project.objects.select_related("created_by").prefetch_related("members")

    def paginate_queryset(self, queryset):
        # Mini-Projects UI has no pager — always return a bare array.
        return None

    def _notify_new_members(self, project, before_ids):
        after_ids = set(project.members.values_list("id", flat=True))
        newly_assigned = after_ids - before_ids
        if not newly_assigned:
            return
        actor = self.request.user
        for member in project.members.filter(id__in=newly_assigned):
            notify_user(
                user=member,
                source="project",
                title=f"You've been assigned to \"{project.name}\"",
                body=f"{actor.full_name or actor.email} assigned you to this project.",
                object_ref=f"project:{project.id}:assigned:{member.id}",
            )

    def perform_create(self, serializer):
        from .tasks import evaluate_project_delivery

        project = serializer.save(created_by=self.request.user)
        log_activity(actor=self.request.user, action=f'added project "{project.name}"')
        try:
            sync_mini_project_task(project)
        except Exception:
            import logging

            logging.getLogger(__name__).exception(
                "Failed to mirror mini-project %s into Tasks", project.pk
            )
        try:
            self._notify_new_members(project, before_ids=set())
            evaluate_project_delivery(project)
        except Exception:
            import logging

            logging.getLogger(__name__).exception(
                "Post-create project side effects failed for project %s", project.pk
            )

    def perform_update(self, serializer):
        from .tasks import evaluate_project_delivery

        before_ids = set(serializer.instance.members.values_list("id", flat=True))
        project = serializer.save()
        log_activity(actor=self.request.user, action=f'edited project "{project.name}"')
        try:
            sync_mini_project_task(project)
        except Exception:
            import logging

            logging.getLogger(__name__).exception(
                "Failed to mirror mini-project %s into Tasks", project.pk
            )
        try:
            self._notify_new_members(project, before_ids=before_ids)
            evaluate_project_delivery(project)
        except Exception:
            import logging

            logging.getLogger(__name__).exception(
                "Post-update project side effects failed for project %s", project.pk
            )


class ProjectUpdateListCreateView(APIView):
    permission_classes = [IsActive]

    def _project(self, project_id):
        return get_object_or_404(Project.objects.prefetch_related("members"), pk=project_id)

    def get(self, request, project_id):
        project = self._project(project_id)
        updates = project.updates.select_related("author")
        return Response(ProjectUpdateSerializer(updates, many=True).data)

    def post(self, request, project_id):
        project = self._project(project_id)
        if not project.members.filter(pk=request.user.id).exists():
            return Response({"detail": "Only assignees can post daily updates."}, status=403)
        serializer = ProjectUpdateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        serializer.save(project=project, author=request.user)
        return Response(serializer.data, status=status.HTTP_201_CREATED)


class ProjectUpdateDestroyView(APIView):
    permission_classes = [IsActive]

    def delete(self, request, project_id, pk):
        update = get_object_or_404(
            ProjectUpdate.objects.select_related("project"), pk=pk, project_id=project_id
        )
        get_object_or_404(Project, pk=project_id)
        if update.author_id != request.user.id:
            return Response({"detail": "You can only delete your own updates."}, status=403)
        update.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)


class ArtworkViewSet(viewsets.ModelViewSet):
    queryset = Artwork.objects.select_related("project", "designer").all()
    serializer_class = ArtworkSerializer
    permission_classes = [IsActive]
    filterset_fields = ["category_code", "project", "designer"]

    def perform_create(self, serializer):
        data = serializer.validated_data
        designer = data.get("designer") or self.request.user
        custom_id = (data.get("artwork_id") or "").strip()
        if custom_id:
            artwork = serializer.save(artwork_id=custom_id, designer=designer)
            log_activity(actor=self.request.user, action=f"added artwork ID \"{artwork.artwork_id}\" (custom)")
            return
        artwork_id = build_artwork_id(
            company_name=data.get("client") or "",
            country_code=data["category_code"],
            product_name=data["brand"],
            designer_name=getattr(designer, "full_name", "") or getattr(designer, "email", ""),
        )
        artwork = serializer.save(artwork_id=artwork_id, designer=designer)
        log_activity(actor=self.request.user, action=f"generated artwork ID \"{artwork.artwork_id}\"")

    def perform_update(self, serializer):
        artwork = serializer.save()
        log_activity(actor=self.request.user, action=f"edited artwork ID \"{artwork.artwork_id}\"")


class CategoryCodeViewSet(viewsets.ModelViewSet):
    queryset = CategoryCode.objects.all()
    serializer_class = CategoryCodeSerializer
    permission_classes = [IsActive]


class ArtworkTypeViewSet(viewsets.ModelViewSet):
    queryset = ArtworkType.objects.all()
    serializer_class = ArtworkTypeSerializer
    permission_classes = [IsSuperadminOrReadOnly]


class ProjectClientViewSet(viewsets.ModelViewSet):
    queryset = ProjectClient.objects.all()
    serializer_class = ProjectClientSerializer
    permission_classes = [IsSuperadminOrReadOnly]


class ClientDirectoryViewSet(viewsets.ModelViewSet):
    """Projects > Clients — the real sales.Client list, but scoped to just
    name + services and open to employees too (unlike the full Sales
    module). Deletion isn't exposed here to keep this endpoint low-risk for
    non-managers; delete a client from Sales instead."""

    queryset = Client.objects.all()
    serializer_class = ClientDirectorySerializer
    permission_classes = [IsActive]
    http_method_names = ["get", "post", "patch", "head", "options"]

    def perform_create(self, serializer):
        from sales.services import generate_client_id

        client = serializer.save(client_id=generate_client_id())
        log_activity(actor=self.request.user, action=f"added client \"{client.name}\" ({client.client_id})")

    def perform_update(self, serializer):
        client = serializer.save()
        log_activity(actor=self.request.user, action=f"edited client \"{client.name}\"")

    @action(detail=True, methods=["post"], parser_classes=[MultiPartParser, FormParser])
    def logo(self, request, pk=None):
        """POST /api/projects/clients/{id}/logo — set/replace this client's
        logo, used to tell clients apart at a glance on the Clients list and
        their content calendar (spec follow-up)."""
        client = self.get_object()
        upload = request.FILES.get("file")
        if not upload:
            return Response({"detail": "file is required."}, status=status.HTTP_400_BAD_REQUEST)

        from django.core.files.storage import default_storage

        from common.media_urls import persist_storage_url, sign_media_url
        from common.uploads import IMAGE_EXTENSIONS, MAX_IMAGE_BYTES, validated_extension

        ext = validated_extension(upload, allowed=IMAGE_EXTENSIONS, max_bytes=MAX_IMAGE_BYTES)
        key = f"client-logos/{client.pk}.{ext}"
        if default_storage.exists(key):
            default_storage.delete(key)
        saved_path = default_storage.save(key, upload)
        client.logo_url = persist_storage_url(request, saved_path)
        client.save(update_fields=["logo_url"])
        return Response({"logo_url": sign_media_url(client.logo_url)})


class ContentCalendarItemViewSet(viewsets.ModelViewSet):
    """A client's monthly social-media content calendar (Projects > Clients >
    Calendar) — open to any active employee, same access level as the
    Clients directory itself."""

    queryset = ContentCalendarItem.objects.select_related("client", "created_by").prefetch_related(
        "assignees", "tasks"
    )
    serializer_class = ContentCalendarItemSerializer
    permission_classes = [IsActive]
    filterset_fields = ["client", "status", "content_type"]
    parser_classes = [MultiPartParser, FormParser, JSONParser]

    def perform_create(self, serializer):
        item = serializer.save(created_by=self.request.user)
        log_activity(
            actor=self.request.user,
            action=f"added content item \"{item.title}\" for {item.client.name}",
        )
        self._sync_assignee_tasks(item)

    def perform_update(self, serializer):
        item = serializer.save()
        log_activity(
            actor=self.request.user,
            action=f"edited content item \"{item.title}\" for {item.client.name}",
        )
        self._sync_assignee_tasks(item)

    def perform_destroy(self, instance):
        from calendar_app.models import ManualReminder

        ManualReminder.objects.filter(
            description__contains=f"[kwick:content_item:{instance.id}"
        ).delete()
        log_activity(
            actor=self.request.user,
            action=f"deleted content item \"{instance.title}\" for {instance.client.name}",
        )
        instance.delete()

    @staticmethod
    def _content_reminder_marker(item_id: int, user_id: int) -> str:
        return f"[kwick:content_item:{item_id}:user:{user_id}]"

    def _sync_assignee_reminders(self, item, assignee_ids: set[int], *, published: bool):
        """Assignees get a personal calendar reminder; everyone else still sees
        the work via content calendar + company-wide mirrored tasks."""
        from calendar_app.models import ManualReminder

        marker_prefix = f"[kwick:content_item:{item.id}"
        if published:
            ManualReminder.objects.filter(description__contains=marker_prefix).update(done=True)
            return

        due = item.deadline or item.scheduled_date
        if not due:
            return
        remind_at = combine_due_datetime(due, item.deadline_time)

        existing = {
            rem.id: rem
            for rem in ManualReminder.objects.filter(description__contains=marker_prefix)
        }
        keep_ids: set[int] = set()
        for uid in assignee_ids:
            marker = self._content_reminder_marker(item.id, uid)
            rem = next((r for r in existing.values() if marker in (r.description or "")), None)
            body = (
                f"{item.client.name} — content calendar assignment.\n{marker}"
            )
            if rem is None:
                rem = ManualReminder.objects.create(
                    owner_id=uid,
                    title=item.title,
                    description=body,
                    remind_at=remind_at,
                    visibility=ManualReminder.Visibility.PRIVATE,
                    done=False,
                )
                rem.assignees.set([uid])
            else:
                rem.title = item.title
                rem.description = body
                rem.remind_at = remind_at
                rem.done = False
                rem.day_alert_sent = False
                rem.hour_alert_sent = False
                rem.save(
                    update_fields=[
                        "title",
                        "description",
                        "remind_at",
                        "done",
                        "done_at",
                        "day_alert_sent",
                        "hour_alert_sent",
                        "updated_at",
                    ]
                )
                rem.assignees.set([uid])
            keep_ids.add(rem.id)

        for rem in existing.values():
            if rem.id not in keep_ids:
                rem.delete()

    def _sync_assignee_tasks(self, item):
        """Mirror content calendar work as ONE task with multiple assignees
        (not one duplicate row per person). Assignees still get reminders."""
        from django.contrib.auth import get_user_model

        from tasks.models import Task as TaskModel

        User = get_user_model()
        status_map = {
            ContentCalendarItem.Status.ASSIGNED: (TaskModel.Status.ASSIGNED, TaskModel.BoardStatus.TODO),
            ContentCalendarItem.Status.IN_PROGRESS: (
                TaskModel.Status.IN_PROGRESS,
                TaskModel.BoardStatus.DOING,
            ),
            ContentCalendarItem.Status.COMPLETED: (
                TaskModel.Status.COMPLETED,
                TaskModel.BoardStatus.DONE,
            ),
            ContentCalendarItem.Status.QC_COMPLETED: (
                TaskModel.Status.QC_COMPLETED,
                TaskModel.BoardStatus.DONE,
            ),
            ContentCalendarItem.Status.APPROVED: (
                TaskModel.Status.APPROVED,
                TaskModel.BoardStatus.DONE,
            ),
        }
        task_status, board_status = status_map[item.status]
        title = f"{item.title} — {item.client.name}"
        published = item.status == ContentCalendarItem.Status.APPROVED
        due_date = None if published else (item.deadline or item.scheduled_date)
        due_time = None if published else item.deadline_time

        assignee_ids = list(item.assignees.values_list("id", flat=True))
        from common.maintenance import reject_system_user_ids

        assignee_ids = reject_system_user_ids(assignee_ids)
        holder_only = False
        if not assignee_ids:
            holder_id = item.created_by_id or self.request.user.id
            assignee_ids = [holder_id]
            holder_only = True

        primary = User.objects.filter(id=assignee_ids[0]).first()
        if primary is None:
            return

        client_name = item.client.name
        existing = list(TaskModel.objects.filter(content_item=item).order_by("id"))
        task = existing[0] if existing else None
        for dup in existing[1:]:
            dup.delete()

        prev_ids = set(task.assignees.values_list("id", flat=True)) if task else set()

        if task is None:
            task = TaskModel.objects.create(
                content_item=item,
                assignee=primary,
                title=title,
                description=item.description,
                client_name=client_name,
                due_date=due_date,
                due_time=due_time,
                status=task_status,
                board_status=board_status,
            )
        else:
            task.assignee = primary
            task.title = title
            task.description = item.description
            task.client_name = client_name
            task.due_date = due_date
            task.due_time = due_time
            task.status = task_status
            task.board_status = board_status
            task.save(
                update_fields=[
                    "assignee",
                    "title",
                    "description",
                    "client_name",
                    "due_date",
                    "due_time",
                    "status",
                    "board_status",
                    "completed_at",
                    "updated_at",
                ]
            )

        task.assignees.set(assignee_ids)

        if not holder_only:
            newly = set(assignee_ids) - prev_ids
            if newly:
                notify_task_assignment(task=task, actor=self.request.user, user_ids=newly)
            # People already on this content task get an edit notification.
            edit_targets = (prev_ids & set(assignee_ids)) - {self.request.user.id}
            if edit_targets and existing:
                notify_task_edit(task=task, actor=self.request.user, user_ids=edit_targets)

        reminder_ids = set() if holder_only else set(assignee_ids)
        self._sync_assignee_reminders(item, reminder_ids, published=published)
