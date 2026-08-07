from rest_framework import serializers

from sales.models import Client

from .models import Artwork, ArtworkType, CategoryCode, ContentCalendarItem, Project, ProjectClient


class ProjectSerializer(serializers.ModelSerializer):
    created_by_name = serializers.SerializerMethodField()
    member_names = serializers.SerializerMethodField()

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
            "created_at",
        ]
        # created_by is set server-side only (perform_create) — never
        # accepted from the client, so it can't be spoofed.
        read_only_fields = ["created_by", "member_names"]

    def get_created_by_name(self, obj):
        if not obj.created_by:
            return ""
        return obj.created_by.full_name or obj.created_by.email

    def get_member_names(self, obj):
        return [{"id": u.id, "name": u.full_name or u.email} for u in obj.members.all()]


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
    Sales module's own use of the same model."""

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
            "accent_color",
            "logo_url",
        ]
        read_only_fields = ["client_id", "logo_url"]


class ContentCalendarItemSerializer(serializers.ModelSerializer):
    """A client's monthly social-media content calendar item (Projects >
    Clients > Calendar). `attachment` is write-only — pass a file to (re)set
    it; omit it to leave the existing attachment untouched."""

    assignee_names = serializers.SerializerMethodField()
    created_by_name = serializers.SerializerMethodField()
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
            "status",
            "assignees",
            "assignee_names",
            "attachment",
            "attachment_url",
            "created_by",
            "created_by_name",
            "created_at",
        ]
        read_only_fields = ["attachment_url", "created_by", "created_at"]

    def get_assignee_names(self, obj):
        return [{"id": u.id, "name": u.full_name or u.email} for u in obj.assignees.all()]

    def get_created_by_name(self, obj):
        if not obj.created_by:
            return ""
        return obj.created_by.full_name or obj.created_by.email

    def _save_attachment(self, instance, upload):
        from django.core.files.storage import default_storage

        request = self.context["request"]
        ext = upload.name.rsplit(".", 1)[-1].lower() if "." in upload.name else "bin"
        key = f"content-calendar/{instance.client_id}/{instance.pk}.{ext}"
        if default_storage.exists(key):
            default_storage.delete(key)
        saved_path = default_storage.save(key, upload)
        instance.attachment_url = request.build_absolute_uri(default_storage.url(saved_path))
        instance.save(update_fields=["attachment_url"])

    def create(self, validated_data):
        attachment = validated_data.pop("attachment", None)
        assignees = validated_data.pop("assignees", [])
        instance = ContentCalendarItem.objects.create(**validated_data)
        if assignees:
            instance.assignees.set(assignees)
        if attachment:
            self._save_attachment(instance, attachment)
        return instance

    def update(self, instance, validated_data):
        attachment = validated_data.pop("attachment", None)
        assignees = validated_data.pop("assignees", None)
        for field, value in validated_data.items():
            setattr(instance, field, value)
        instance.save()
        if assignees is not None:
            instance.assignees.set(assignees)
        if attachment:
            self._save_attachment(instance, attachment)
        return instance
