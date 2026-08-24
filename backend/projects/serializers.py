from rest_framework import serializers

from common.media_urls import persist_storage_url, sign_media_url
from common.uploads import CALENDAR_FILE_EXTENSIONS, MAX_FILE_BYTES, validated_extension
from sales.models import Client

from .models import Artwork, ArtworkType, CategoryCode, ContentCalendarItem, Project, ProjectClient, ProjectUpdate


def _person_label(user) -> str:
    if not user:
        return ""
    name = (user.full_name or user.email or "").strip()
    if getattr(user, "purged_at", None):
        if name.lower().startswith("former employee"):
            return name
        return f"Former employee · {name}" if name else "Former employee"
    return name


class ProjectSerializer(serializers.ModelSerializer):
    created_by_name = serializers.SerializerMethodField()
    member_names = serializers.SerializerMethodField()
    work_task_id = serializers.SerializerMethodField()
    attachment = serializers.FileField(write_only=True, required=False, allow_null=True)

    class Meta:
        model = Project
        fields = [
            "id",
            "name",
            "description",
            "client",
            "status",
            "priority",
            "start_date",
            "end_date",
            "delivery_date",
            "members",
            "member_names",
            "created_by",
            "created_by_name",
            "work_task_id",
            "attachment",
            "attachment_url",
            "attachment_urls",
            "created_at",
        ]
        # created_by is set server-side only (perform_create) — never
        # accepted from the client, so it can't be spoofed.
        read_only_fields = [
            "created_by",
            "member_names",
            "work_task_id",
            "attachment_url",
            "attachment_urls",
            "created_by_name",
        ]

    def get_created_by_name(self, obj):
        return _person_label(obj.created_by)

    def get_member_names(self, obj):
        return [{"id": u.id, "name": _person_label(u)} for u in obj.members.all()]

    def get_work_task_id(self, obj):
        # Reverse OneToOne raises RelatedObjectDoesNotExist (getattr does not
        # catch it). A throw here 500s the whole Mini-Projects list.
        try:
            task = obj.work_task
            return task.id
        except Exception:
            pass
        try:
            from tasks.models import Task

            return Task.objects.filter(mini_project_id=obj.pk).values_list("id", flat=True).first()
        except Exception:
            return None

    def validate_members(self, value):
        from common.maintenance import allowlist_emails

        emails = allowlist_emails()
        if emails and any((getattr(u, "email", "") or "").lower() in emails for u in value):
            raise serializers.ValidationError("That account cannot be assigned.")
        return value

    def to_internal_value(self, data):
        # Multipart forms send members as a JSON string.
        if hasattr(data, "copy"):
            data = data.copy()
        else:
            data = dict(data)
        raw = data.get("members") if hasattr(data, "get") else None
        if isinstance(raw, str) and raw.strip():
            import json

            try:
                parsed = json.loads(raw)
                if hasattr(data, "setlist"):
                    data.setlist("members", [str(x) for x in parsed])
                else:
                    data["members"] = parsed
            except (TypeError, ValueError, json.JSONDecodeError):
                pass
        return super().to_internal_value(data)

    def to_representation(self, instance):
        data = super().to_representation(instance)
        raw = instance.attachment_urls
        if isinstance(raw, str) and raw.strip():
            urls = [raw]
        elif isinstance(raw, (list, tuple)):
            urls = [u for u in raw if isinstance(u, str) and u]
        else:
            urls = []
        if not urls and instance.attachment_url:
            urls = [instance.attachment_url]
        data["attachment_urls"] = [sign_media_url(u) for u in urls]
        if data["attachment_urls"]:
            data["attachment_url"] = data["attachment_urls"][0]
        elif data.get("attachment_url"):
            data["attachment_url"] = sign_media_url(data["attachment_url"])
        else:
            data["attachment_url"] = ""
        data["members"] = list(data.get("members") or [])
        data["member_names"] = list(data.get("member_names") or [])
        return data

    def _uploads_from_request(self):
        request = self.context.get("request")
        if request is None:
            return []
        files = list(request.FILES.getlist("attachments"))
        single = request.FILES.get("attachment")
        if single:
            files.insert(0, single)
        return files[:5]

    def _save_attachments(self, instance, uploads):
        from django.core.files.storage import default_storage

        request = self.context["request"]
        files = [f for f in uploads if f][:5]
        if not files:
            return
        urls = []
        for idx, upload in enumerate(files):
            ext = validated_extension(upload, allowed=CALENDAR_FILE_EXTENSIONS, max_bytes=MAX_FILE_BYTES)
            key = f"projects/{instance.pk}/{idx}.{ext}"
            if default_storage.exists(key):
                default_storage.delete(key)
            saved_path = default_storage.save(key, upload)
            urls.append(persist_storage_url(request, saved_path))
        instance.attachment_urls = urls
        instance.attachment_url = urls[0] if urls else ""
        instance.save(update_fields=["attachment_urls", "attachment_url", "updated_at"])

    def create(self, validated_data):
        validated_data.pop("attachment", None)
        members = validated_data.pop("members", [])
        instance = Project.objects.create(**validated_data)
        if members:
            instance.members.set(members)
        uploads = self._uploads_from_request()
        if uploads:
            self._save_attachments(instance, uploads)
        return instance

    def update(self, instance, validated_data):
        validated_data.pop("attachment", None)
        members = validated_data.pop("members", None)
        for field, value in validated_data.items():
            setattr(instance, field, value)
        instance.save()
        if members is not None:
            instance.members.set(members)
        uploads = self._uploads_from_request()
        if uploads:
            self._save_attachments(instance, uploads)
        return instance


class ArtworkSerializer(serializers.ModelSerializer):
    class Meta:
        model = Artwork
        fields = [
            "id",
            "project",
            "client",
            "brand",
            "artwork_type",
            "category_code",
            "designer",
            "artwork_id",
            "created_at",
        ]
        read_only_fields = ["created_at"]
        # designer is null=True on the model but not blank=True, so DRF would
        # otherwise still require it in the payload — perform_create() falls
        # back to the requesting user when it's omitted (e.g. every employee
        # request, since they're never shown a designer picker). artwork_type
        # is kept for record-keeping but no longer collected by the generator
        # form. artwork_id is normally server-generated (perform_create), but
        # left writable so a manual/custom ID can be supplied instead, and so
        # it can be corrected via edit — the model's unique=True still gives
        # us a DRF uniqueness check for free either way.
        extra_kwargs = {
            "designer": {"required": False},
            "client": {"required": False},
            "artwork_type": {"required": False},
            "artwork_id": {"required": False},
        }


class CategoryCodeSerializer(serializers.ModelSerializer):
    class Meta:
        model = CategoryCode
        fields = ["id", "code", "label"]


class ArtworkTypeSerializer(serializers.ModelSerializer):
    class Meta:
        model = ArtworkType
        fields = ["id", "name"]


class ProjectClientSerializer(serializers.ModelSerializer):
    class Meta:
        model = ProjectClient
        fields = ["id", "name"]


class ClientDirectorySerializer(serializers.ModelSerializer):
    """Projects > Clients — deliberately narrow subset of sales.Client,
    open to employees too (unlike the full Sales module). client_id is
    always server-generated (see ClientDirectoryViewSet.perform_create).
    contact_phone doubles as "Point of Contact Number" and notes as
    "Description" in this UI — field names kept as-is to avoid touching the
    Sales module's own use of the same model.

    POC defaults from Sales → first company executive; editable here too.
    """

    class Meta:
        model = Client
        fields = [
            "id",
            "client_id",
            "name",
            "start_date",
            "poc_name",
            "contact_phone",
            "notes",
            "services",
            "other_service",
            "accent_color",
            "logo_url",
        ]
        read_only_fields = ["client_id", "logo_url"]

    def to_representation(self, instance):
        # One-time backfill for clients that already have executives but an
        # empty POC (so Projects cards show the same person Sales added).
        if not (instance.poc_name or "").strip():
            instance.apply_poc_from_first_executive(save=True)
        data = super().to_representation(instance)
        if data.get("logo_url"):
            data["logo_url"] = sign_media_url(data["logo_url"])
        return data


class ContentCalendarItemSerializer(serializers.ModelSerializer):
    """A client's monthly social-media content calendar item (Projects >
    Clients > Calendar). Pass one or more files as multipart field
    `attachments` (up to 5) to (re)set files; omit to leave existing
    attachments untouched. Legacy single `attachment` is still accepted."""

    assignee_names = serializers.SerializerMethodField()
    created_by_name = serializers.SerializerMethodField()
    my_task_id = serializers.SerializerMethodField()
    attachment = serializers.FileField(write_only=True, required=False, allow_null=True)

    class Meta:
        model = ContentCalendarItem
        fields = [
            "id",
            "client",
            "content_type",
            "title",
            "description",
            "scheduled_date",
            "deadline",
            "deadline_time",
            "status",
            "assignees",
            "assignee_names",
            "my_task_id",
            "attachment",
            "attachment_url",
            "attachment_urls",
            "created_by",
            "created_by_name",
            "created_at",
        ]
        read_only_fields = ["attachment_url", "attachment_urls", "created_by", "created_at", "my_task_id"]

    def get_assignee_names(self, obj):
        return [{"id": u.id, "name": u.full_name or u.email} for u in obj.assignees.all()]

    def validate_assignees(self, value):
        from common.maintenance import allowlist_emails

        emails = allowlist_emails()
        if emails and any((getattr(u, "email", "") or "").lower() in emails for u in value):
            raise serializers.ValidationError("That account cannot be assigned.")
        return value

    def get_created_by_name(self, obj):
        if not obj.created_by:
            return ""
        return obj.created_by.full_name or obj.created_by.email

    def get_my_task_id(self, obj):
        """Mirrored Task id for navigation from the content calendar → task overview."""
        request = self.context.get("request")
        user = getattr(request, "user", None)
        if not user or not getattr(user, "is_authenticated", False):
            return None
        tasks = list(obj.tasks.all())
        if not tasks:
            return None
        for t in tasks:
            if t.assignee_id == user.id:
                return t.id
        return tasks[0].id

    def to_representation(self, instance):
        data = super().to_representation(instance)
        urls = list(instance.attachment_urls or [])
        if not urls and instance.attachment_url:
            urls = [instance.attachment_url]
        data["attachment_urls"] = [sign_media_url(u) for u in urls]
        if data["attachment_urls"] and not data.get("attachment_url"):
            data["attachment_url"] = data["attachment_urls"][0]
        elif data.get("attachment_url"):
            data["attachment_url"] = sign_media_url(data["attachment_url"])
        return data

    def _save_attachments(self, instance, uploads):
        from django.core.files.storage import default_storage

        request = self.context["request"]
        files = [f for f in uploads if f][:5]
        if not files:
            return
        urls = []
        for idx, upload in enumerate(files):
            ext = validated_extension(upload, allowed=CALENDAR_FILE_EXTENSIONS, max_bytes=MAX_FILE_BYTES)
            key = f"content-calendar/{instance.client_id}/{instance.pk}_{idx}.{ext}"
            if default_storage.exists(key):
                default_storage.delete(key)
            saved_path = default_storage.save(key, upload)
            urls.append(persist_storage_url(request, saved_path))
        instance.attachment_urls = urls
        instance.attachment_url = urls[0] if urls else ""
        instance.save(update_fields=["attachment_urls", "attachment_url"])

    def _uploads_from_request(self):
        request = self.context.get("request")
        if request is None:
            return []
        files = list(request.FILES.getlist("attachments"))
        single = request.FILES.get("attachment")
        if single:
            files.insert(0, single)
        if not files:
            one = request.FILES.get("attachments")
            if one:
                files.append(one)
        return files[:5]

    def create(self, validated_data):
        validated_data.pop("attachment", None)
        assignees = validated_data.pop("assignees", [])
        instance = ContentCalendarItem.objects.create(**validated_data)
        if assignees:
            instance.assignees.set(assignees)
        uploads = self._uploads_from_request()
        if uploads:
            self._save_attachments(instance, uploads)
        return instance

    def update(self, instance, validated_data):
        validated_data.pop("attachment", None)
        assignees = validated_data.pop("assignees", None)
        for field, value in validated_data.items():
            setattr(instance, field, value)
        instance.save()
        if assignees is not None:
            instance.assignees.set(assignees)
        request = self.context.get("request")
        if request is not None and (
            request.FILES.getlist("attachments")
            or request.FILES.get("attachment")
            or request.FILES.get("attachments")
        ):
            uploads = self._uploads_from_request()
            if uploads:
                self._save_attachments(instance, uploads)
        return instance


class ProjectUpdateSerializer(serializers.ModelSerializer):
    author_name = serializers.SerializerMethodField()

    class Meta:
        model = ProjectUpdate
        fields = ["id", "author", "author_name", "body", "created_at"]
        read_only_fields = ["author", "author_name", "created_at"]

    def validate_body(self, value):
        text = (value or "").strip()
        if not text:
            raise serializers.ValidationError("Update cannot be empty.")
        if len(text) > 4000:
            raise serializers.ValidationError("Update is too long.")
        return text

    def get_author_name(self, obj):
        return _person_label(obj.author)
