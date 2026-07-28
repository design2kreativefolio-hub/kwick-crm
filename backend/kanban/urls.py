from django.urls import path

from .views import BoardView, MoveTaskView

urlpatterns = [
    path("board", BoardView.as_view(), name="kanban-board"),
    path("tasks/<int:task_id>/move", MoveTaskView.as_view(), name="kanban-move"),
]
