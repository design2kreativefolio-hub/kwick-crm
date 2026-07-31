from rest_framework.routers import DefaultRouter

from .views import TodoItemViewSet

router = DefaultRouter(trailing_slash=False)  # frontend calls without trailing slash
# Named prefix (not "") — see config/urls.py for why.
router.register("todos", TodoItemViewSet, basename="todos")

urlpatterns = router.urls
