from django.urls import path
from rest_framework.routers import DefaultRouter

from .views import (
    EmployeeCollateralView,
    LeaveBalanceView,
    LeaveViewSet,
    MyCollateralsView,
    StaffViewSet,
    TicketViewSet,
)

router = DefaultRouter(trailing_slash=False)  # frontend calls without trailing slash
router.register("staff", StaffViewSet, basename="staff")
router.register("leaves", LeaveViewSet, basename="leaves")
router.register("tickets", TicketViewSet, basename="tickets")

urlpatterns = [
    path("employee-collaterals/mine", MyCollateralsView.as_view(), name="collaterals-mine"),
    path("employee-collaterals/<str:doc_type>", EmployeeCollateralView.as_view(), name="collaterals-generate"),
    path("leaves/balance", LeaveBalanceView.as_view(), name="leaves-balance"),
]
urlpatterns += router.urls
