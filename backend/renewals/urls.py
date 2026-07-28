from rest_framework.routers import DefaultRouter

from .views import RenewalViewSet

router = DefaultRouter(trailing_slash=False)  # frontend calls without trailing slash
router.register("", RenewalViewSet, basename="renewals")

urlpatterns = router.urls
