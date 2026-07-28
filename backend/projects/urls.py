from rest_framework.routers import DefaultRouter

from .views import (
    ArtworkTypeViewSet,
    ArtworkViewSet,
    CategoryCodeViewSet,
    ProjectClientViewSet,
    ProjectViewSet,
)

router = DefaultRouter(trailing_slash=False)  # frontend calls without trailing slash
router.register("artworks", ArtworkViewSet, basename="artworks")
router.register("category-codes", CategoryCodeViewSet, basename="category-codes")
router.register("artwork-types", ArtworkTypeViewSet, basename="artwork-types")
router.register("project-clients", ProjectClientViewSet, basename="project-clients")
router.register("", ProjectViewSet, basename="projects")

urlpatterns = router.urls
