from rest_framework import serializers

from sales.models import Client

from .models import Artwork, ArtworkType, CategoryCode, Project, ProjectClient


class ProjectSerializer(serializers.ModelSerializer):
    client_name = serializers.CharField(source="client.name", read_only=True, default="")

    class Meta:
        model = Project
        fields = [
            "id",
            "name",
            "client",
            "client_name",
            "status",
            "start_date",
            "end_date",
            "members",
            "created_at",
        ]


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
        read_only_fields = ["artwork_id", "created_at"]
        # designer is null=True on the model but not blank=True, so DRF would
        # otherwise still require it in the payload — perform_create() falls
        # back to the requesting user when it's omitted (e.g. every employee
        # request, since they're never shown a designer picker). client and
        # artwork_type are kept for record-keeping but no longer collected
        # by the generator form (current ID format doesn't embed them).
        extra_kwargs = {
            "designer": {"required": False},
            "client": {"required": False},
            "artwork_type": {"required": False},
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
    """Projects > Clients — deliberately narrow: only name + services are
    ever exposed here, regardless of what other fields sales.Client has.
    Full contact-info editing stays exclusive to the Sales module."""

    class Meta:
        model = Client
        fields = ["id", "name", "services"]
