from django.urls import path
from rest_framework.routers import DefaultRouter

from .views import (
    EmployeeCollateralDetailView,
    EmployeeCollateralUploadView,
    EmployeeCollateralView,
    LeaveBalanceView,
    LeaveViewSet,
    MyCollateralsView,
    StaffAvatarUploadView,
    StaffViewSet,
    TicketViewSet,
)

router = DefaultRouter(trailing_slash=False)  # frontend calls without trailing slash
router.register("staff", StaffViewSet, basename="staff")
router.register("leaves", LeaveViewSet, basename="leaves")
router.register("tickets", TicketViewSet, basename="tickets")

urlpatterns = [
    path("employee-collaterals/mine", MyCollateralsView.as_view(), name="collaterals-mine"),
    path("employee-collaterals/upload", EmployeeCollateralUploadView.as_view(), name="collaterals-upload"),
    # <int:pk> before <str:doc_type> so numeric ids route to delete, not the
    # generate-by-slug view (Django tries urlpatterns in order).
    path("employee-collaterals/<int:pk>", EmployeeCollateralDetailView.as_view(), name="collaterals-detail"),
    path("employee-collaterals/<str:doc_type>", EmployeeCollateralView.as_view(), name="collaterals-generate"),
    path("leaves/balance", LeaveBalanceView.as_view(), name="leaves-balance"),
    path("staff/<int:pk>/avatar", StaffAvatarUploadView.as_view(), name="staff-avatar"),
]
urlpatterns += router.urls
