import secrets

from django.utils import timezone
from rest_framework import status, viewsets
from rest_framework.decorators import action
from rest_framework.parsers import FormParser, JSONParser, MultiPartParser
from rest_framework.response import Response
from rest_framework.views import APIView
from django.shortcuts import get_object_or_404

from common.uploads import IMAGE_EXTENSIONS, VIDEO_EXTENSIONS, validated_extension
from common.permissions import IsActive, IsSuperadminOrReadOnly
from common.services import log_activity
from notifications.services import notify_user
from sales.models import Client
from tasks.services import combine_due_datetime, notify_task_assignment, notify_task_edit

from .models import (
    Artwork,
    ArtworkType,
    CategoryCode,
    ClientCalendarShare,
    ContentCalendarComment,
    ContentCalendarItem,
    Project,
    ProjectClient,
    ProjectUpdate,
)
from .serializers import (
    ArtworkSerializer,
    ArtworkTypeSerializer,
    CategoryCodeSerializer,
    ClientDirectorySerializer,
    ContentCalendarCommentSerializer,
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
        qs = Project.objects.select_related("created_by").prefetch_related("members")
        cid = self.request.query_params.get("for_client")
        if cid:
            from sales.models import Client

            name = Client.objects.filter(pk=cid).values_list("name", flat=True).first()
            if not name:
                return qs.none()
            return qs.filter(client__iexact=name)
        return qs

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
        "assignees", "tasks", "comments"
    )
    serializer_class = ContentCalendarItemSerializer
    permission_classes = [IsActive]
    filterset_fields = ["client", "status", "content_type"]
    parser_classes = [MultiPartParser, FormParser, JSONParser]

    def paginate_queryset(self, queryset):
        # Client Calendar UI has no pager — it loads a client's whole history
        # in one shot (same reasoning as ProjectViewSet below). Left on the
        # default 25/page before, a client with 25+ items silently lost
        # anything past page 1 (ordered by scheduled_date, not created_at),
        # so newly added items could vanish from their own client's calendar
        # while still existing — exactly what happened once a client's
        # content list grew past 25.
        return None

    # --- Client share link + client-facing post -------------------------

    CLIENT_POST_STATUSES = frozenset(
        {ContentCalendarItem.Status.QC_COMPLETED, ContentCalendarItem.Status.APPROVED}
    )
    CLIENT_POST_EXTENSIONS = IMAGE_EXTENSIONS | VIDEO_EXTENSIONS | frozenset({"pdf"})
    CLIENT_POST_MAX_BYTES = 30 * 1024 * 1024  # nginx client_max_body_size is 32M
    CLIENT_POST_MAX_FILES = 10

    @staticmethod
    def _share_payload(share):
        if share is None:
            return {"active": False, "token": "", "expires_at": None, "expired": False}
        return {
            "active": share.is_usable(),
            "token": share.token if share.is_active else "",
            "expires_at": share.expires_at,
            "expired": share.is_active and not share.is_usable(),
        }

    @action(detail=False, methods=["get", "post", "delete"], url_path="share")
    def share(self, request):
        """Manage the read-only client calendar link for ?client=<id>."""
        client = get_object_or_404(Client, pk=request.query_params.get("client") or 0)
        share = ClientCalendarShare.objects.filter(client=client).first()

        if request.method == "GET":
            return Response(self._share_payload(share))

        if request.method == "DELETE":
            if share is not None:
                share.is_active = False
                share.save(update_fields=["is_active", "updated_at"])
                log_activity(actor=request.user, action=f"turned off calendar share link for {client.name}")
            return Response(self._share_payload(share))

        expires_at = None
        raw = request.data.get("expires_at")
        if raw:
            from datetime import datetime, time

            from django.utils.dateparse import parse_date, parse_datetime

            parsed = parse_datetime(str(raw))
            if parsed is None:
                day = parse_date(str(raw))
                if day is not None:
                    parsed = datetime.combine(day, time(23, 59, 59))
            if parsed is None:
                return Response({"detail": "Invalid expiry date."}, status=status.HTTP_400_BAD_REQUEST)
            if timezone.is_naive(parsed):
                parsed = timezone.make_aware(parsed)
            if parsed <= timezone.now():
                return Response({"detail": "Expiry must be in the future."}, status=status.HTTP_400_BAD_REQUEST)
            expires_at = parsed

        regenerate = bool(request.data.get("regenerate")) or share is None or not share.is_active
        if share is None:
            share = ClientCalendarShare(client=client, created_by=request.user)
        if regenerate:
            share.token = secrets.token_urlsafe(32)
        share.is_active = True
        share.expires_at = expires_at
        share.save()
        log_activity(actor=request.user, action=f"updated calendar share link for {client.name}")
        return Response(self._share_payload(share))

    @action(detail=True, methods=["post"], url_path="client-post")
    def client_post(self, request, pk=None):
        """Upload the final post the client will see (QC Completed / Approved only)."""
        item = self.get_object()
        if item.status not in self.CLIENT_POST_STATUSES:
            return Response(
                {"detail": "Mark the item QC Completed or Approved before uploading the post."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        from django.core.files.storage import default_storage

        from common.media_urls import persist_storage_url

        uploads = [f for f in request.FILES.getlist("files") if f]
        existing = list(item.client_post_files or [])
        if len(existing) + len(uploads) > self.CLIENT_POST_MAX_FILES:
            return Response(
                {"detail": f"A post can have at most {self.CLIENT_POST_MAX_FILES} files."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        for upload in uploads:
            ext = validated_extension(
                upload, allowed=self.CLIENT_POST_EXTENSIONS, max_bytes=self.CLIENT_POST_MAX_BYTES
            )
            key = f"client-share/{item.client_id}/{item.pk}_{secrets.token_hex(4)}.{ext}"
            saved = default_storage.save(key, upload)
            existing.append(persist_storage_url(request, saved, filename=getattr(upload, "name", "") or ""))
        if not existing:
            return Response({"detail": "Choose at least one file."}, status=status.HTTP_400_BAD_REQUEST)

        item.client_post_files = existing
        if "caption" in request.data:
            item.client_post_caption = str(request.data.get("caption") or "")[:5000]
        item.client_post_uploaded_at = timezone.now()
        item.save(
            update_fields=["client_post_files", "client_post_caption", "client_post_uploaded_at", "updated_at"]
        )
        log_activity(
            actor=request.user,
            action=f'uploaded client post for "{item.title}" ({item.client.name})',
        )
        return Response(self.get_serializer(item).data)

    @client_post.mapping.delete
    def client_post_remove(self, request, pk=None):
        """Remove one uploaded file (?index=n) or the whole post."""
        item = self.get_object()
        files = list(item.client_post_files or [])
        raw = request.query_params.get("index")
        if raw is not None:
            try:
                files.pop(int(raw))
            except (ValueError, IndexError):
                return Response({"detail": "No such file."}, status=status.HTTP_400_BAD_REQUEST)
        else:
            files = []
        item.client_post_files = files
        if not files:
            item.client_post_caption = ""
            item.client_post_uploaded_at = None
        item.save(
            update_fields=["client_post_files", "client_post_caption", "client_post_uploaded_at", "updated_at"]
        )
        return Response(self.get_serializer(item).data)

    @action(detail=True, methods=["get", "post"], url_path="comments")
    def comments(self, request, pk=None):
        """Client comments thread — staff can read it and reply."""
        item = self.get_object()
        if request.method == "POST":
            body = str(request.data.get("body") or "").strip()
            if not body:
                return Response({"detail": "Comment cannot be empty."}, status=status.HTTP_400_BAD_REQUEST)
            ContentCalendarComment.objects.create(
                item=item,
                from_client=False,
                author=request.user,
                author_name=(request.user.full_name or request.user.email)[:120],
                body=body[:2000],
            )
        return Response(ContentCalendarCommentSerializer(item.comments.all(), many=True).data)

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
