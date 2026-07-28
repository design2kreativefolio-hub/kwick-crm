from rest_framework import serializers

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
