from rest_framework.routers import DefaultRouter

from .views import ClientViewSet, InvoiceViewSet, ProposalViewSet

router = DefaultRouter(trailing_slash=False)  # frontend calls without trailing slash
router.register("clients", ClientViewSet, basename="clients")
router.register("proposals", ProposalViewSet, basename="proposals")
router.register("invoices", InvoiceViewSet, basename="invoices")

urlpatterns = router.urls
