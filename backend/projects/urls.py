from rest_framework.routers import DefaultRouter

from .views import (
    ArtworkTypeViewSet,
    ArtworkViewSet,
    CategoryCodeViewSet,
    ClientDirectoryViewSet,
    ProjectClientViewSet,
    ProjectViewSet,
)

# Mounted under "api/projects/" in config/urls.py (named path prefix), so
# these sub-resources live at e.g. "api/projects/artworks" — fine with a
# non-empty router prefix + trailing_slash=False.
router = DefaultRouter(trailing_slash=False)  # frontend calls without trailing slash
router.register("artworks", ArtworkViewSet, basename="artworks")
router.register("category-codes", CategoryCodeViewSet, basename="category-codes")
router.register("artwork-types", ArtworkTypeViewSet, basename="artwork-types")
router.register("project-clients", ProjectClientViewSet, basename="project-clients")
router.register("clients", ClientDirectoryViewSet, basename="client-directory")

urlpatterns = router.urls

# ProjectViewSet itself needs to live at the bare "api/projects" (no nested
# segment) — an empty router prefix ("") under the "api/projects/" mount
# above would force a mandatory trailing slash (DRF strips its own leading
# slash only when prefix="", assuming the include() itself supplies the
# separator — see config/urls.py's comment on the same trap for
# tasks/todos/renewals/daily_tracker). Mounted bare at "api/" instead, with
# a named prefix, exactly like those other apps.
bare_router = DefaultRouter(trailing_slash=False)
bare_router.register("projects", ProjectViewSet, basename="projects")
bare_urlpatterns = bare_router.urls
