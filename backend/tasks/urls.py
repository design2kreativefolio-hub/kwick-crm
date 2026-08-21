from django.urls import path
from rest_framework.routers import DefaultRouter

from .views import TaskUpdateDestroyView, TaskUpdateListCreateView, TaskViewSet

router = DefaultRouter(trailing_slash=False)  # frontend calls without trailing slash
# Named prefix (not "") — see config/urls.py for why: an empty prefix makes
# DRF strip its own leading slash off the detail route, which only works if
# the include() mount supplies that slash back via a trailing "/". Naming the
# prefix here sidesteps that entirely.
router.register("tasks", TaskViewSet, basename="tasks")

urlpatterns = [
    path("tasks/<int:task_id>/updates", TaskUpdateListCreateView.as_view()),
    path("tasks/<int:task_id>/updates/<int:pk>", TaskUpdateDestroyView.as_view()),
] + router.urls
