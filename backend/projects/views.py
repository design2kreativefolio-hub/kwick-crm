from rest_framework import status, viewsets
from rest_framework.response import Response

from common.permissions import IsActive, IsManagerOrReadOnly, is_manager
from common.services import log_activity
from sales.models import Client

from .models import Artwork, ArtworkType, CategoryCode, Project, ProjectClient
from .serializers import (
    ArtworkSerializer,
    ArtworkTypeSerializer,
    CategoryCodeSerializer,
    ClientDirectorySerializer,
    ProjectClientSerializer,
    ProjectSerializer,
)
from .services import build_artwork_id


class ProjectViewSet(viewsets.ModelViewSet):
    """Manager + Employee (spec §7). Employees see projects they're assigned to."""

    serializer_class = ProjectSerializer
    permission_classes = [IsActive]
    filterset_fields = ["status", "client"]
    search_fields = ["name"]

    def get_queryset(self):
        qs = Project.objects.select_related("client").prefetch_related("members")
        if is_manager(self.request.user):
            return qs
        return qs.filter(members=self.request.user)

    def create(self, request, *args, **kwargs):
        if not is_manager(request.user):
            return Response({"detail": "Manager role required."}, status=status.HTTP_403_FORBIDDEN)
        return super().create(request, *args, **kwargs)

    def perform_create(self, serializer):
        project = serializer.save()
        log_activity(actor=self.request.user, action=f"added project \"{project.name}\"")

    def perform_update(self, serializer):
        project = serializer.save()
        log_activity(actor=self.request.user, action=f"edited project \"{project.name}\"")


class ArtworkViewSet(viewsets.ModelViewSet):
    queryset = Artwork.objects.select_related("project", "designer").all()
    serializer_class = ArtworkSerializer
    permission_classes = [IsActive]
    filterset_fields = ["category_code", "project", "designer"]

    def perform_create(self, serializer):
        data = serializer.validated_data
        designer = data.get("designer") or self.request.user
        artwork_id = build_artwork_id(
            country_code=data["category_code"],
            product_name=data["brand"],
            designer_name=getattr(designer, "full_name", "") or getattr(designer, "email", ""),
        )
        artwork = serializer.save(artwork_id=artwork_id, designer=designer)
        log_activity(actor=self.request.user, action=f"generated artwork ID \"{artwork.artwork_id}\"")


class CategoryCodeViewSet(viewsets.ModelViewSet):
    queryset = CategoryCode.objects.all()
    serializer_class = CategoryCodeSerializer
    permission_classes = [IsManagerOrReadOnly]


class ArtworkTypeViewSet(viewsets.ModelViewSet):
    queryset = ArtworkType.objects.all()
    serializer_class = ArtworkTypeSerializer
    permission_classes = [IsManagerOrReadOnly]


class ProjectClientViewSet(viewsets.ModelViewSet):
    queryset = ProjectClient.objects.all()
    serializer_class = ProjectClientSerializer
    permission_classes = [IsManagerOrReadOnly]


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
        client = serializer.save()
        log_activity(actor=self.request.user, action=f"added client \"{client.name}\"")

    def perform_update(self, serializer):
        client = serializer.save()
        log_activity(actor=self.request.user, action=f"edited client \"{client.name}\" (services)")
