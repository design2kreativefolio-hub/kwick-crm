from rest_framework import status, viewsets
from rest_framework.decorators import action
from rest_framework.parsers import FormParser, MultiPartParser
from rest_framework.response import Response

from common.permissions import IsActive, IsSuperadminOrReadOnly
from common.services import log_activity
from notifications.services import notify_user
from sales.models import Client

from .models import Artwork, ArtworkType, CategoryCode, ContentCalendarItem, Project, ProjectClient
from .serializers import (
    ArtworkSerializer,
    ArtworkTypeSerializer,
    CategoryCodeSerializer,
    ClientDirectorySerializer,
    ContentCalendarItemSerializer,
    ProjectClientSerializer,
    ProjectSerializer,
)
from .services import build_artwork_id


class ProjectViewSet(viewsets.ModelViewSet):
    """Projects are company-wide: every active user can see, create, edit,
    and delete. `members` is who is assigned (notifications + personal
    dashboard), not who can view."""

    serializer_class = ProjectSerializer
    permission_classes = [IsActive]
    filterset_fields = ["status", "client"]
    search_fields = ["name"]

    def get_queryset(self):
        return Project.objects.prefetch_related("members")

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
        log_activity(actor=self.request.user, action=f"added project \"{project.name}\"")
        self._notify_new_members(project, before_ids=set())
        evaluate_project_delivery(project)

    def perform_update(self, serializer):
        from .tasks import evaluate_project_delivery

        before_ids = set(serializer.instance.members.values_list("id", flat=True))
        project = serializer.save()
        log_activity(actor=self.request.user, action=f"edited project \"{project.name}\"")
        self._notify_new_members(project, before_ids=before_ids)
        evaluate_project_delivery(project)


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
        log_activity(actor=self.request.user, action=f"edited client \"{client.name}\" (services)")

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

        ext = upload.name.rsplit(".", 1)[-1].lower() if "." in upload.name else "png"
        key = f"client-logos/{client.pk}.{ext}"
        if default_storage.exists(key):
            default_storage.delete(key)
        saved_path = default_storage.save(key, upload)
        client.logo_url = request.build_absolute_uri(default_storage.url(saved_path))
        client.save(update_fields=["logo_url"])
        return Response({"logo_url": client.logo_url})


class ContentCalendarItemViewSet(viewsets.ModelViewSet):
    """A client's monthly social-media content calendar (Projects > Clients >
    Calendar) — open to any active employee, same access level as the
    Clients directory itself."""

    queryset = ContentCalendarItem.objects.select_related("client", "created_by").prefetch_related(
        "assignees"
    )
    serializer_class = ContentCalendarItemSerializer
    permission_classes = [IsActive]
    filterset_fields = ["client", "status", "content_type"]

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

    def _sync_assignee_tasks(self, item):
        """Mirror each current assignee onto their own Task — a content
        calendar assignment must show up in that employee's Tasks list,
        Kanban, Dashboard and Calendar the same way any other task
        assignment does, not just as a notification (spec follow-up)."""
        from tasks.models import Task as TaskModel

        status_map = {
            ContentCalendarItem.Status.PLANNED: (TaskModel.Status.TODO, TaskModel.BoardStatus.TODO),
            ContentCalendarItem.Status.IN_PROGRESS: (TaskModel.Status.IN_PROGRESS, TaskModel.BoardStatus.DOING),
            ContentCalendarItem.Status.DONE: (TaskModel.Status.COMPLETED, TaskModel.BoardStatus.DONE),
        }
        task_status, board_status = status_map[item.status]
        title = f"{item.title} — {item.client.name}"
        due_date = item.deadline or item.scheduled_date

        current_ids = set(item.assignees.values_list("id", flat=True))
        existing = {t.assignee_id: t for t in TaskModel.objects.filter(content_item=item)}

        for assignee_id, task in existing.items():
            if assignee_id not in current_ids:
                task.delete()

        for assignee in item.assignees.all():
            task = existing.get(assignee.id)
            if task is None:
                task = TaskModel.objects.create(
                    content_item=item,
                    assignee=assignee,
                    title=title,
                    description=item.description,
                    due_date=due_date,
                    status=task_status,
                    board_status=board_status,
                )
                if assignee.id != self.request.user.id:
                    notify_user(
                        user=assignee,
                        source="content_calendar",
                        title=f"You were assigned to \"{item.title}\"",
                        body=f"{item.client.name} — scheduled {item.scheduled_date}.",
                        object_ref=f"content_item:{item.id}",
                    )
            else:
                task.title = title
                task.description = item.description
                task.due_date = due_date
                task.status = task_status
                task.board_status = board_status
                task.save(
                    update_fields=["title", "description", "due_date", "status", "board_status", "completed_at", "updated_at"]
                )
