from django.urls import path

from .public_views import PublicCalendarCommentsView, PublicCalendarFileView, PublicCalendarView

# Mounted under "api/public/calendar/" — no authentication.
urlpatterns = [
    path("<str:token>", PublicCalendarView.as_view()),
    path("<str:token>/items/<int:item_id>/files/<int:index>", PublicCalendarFileView.as_view()),
    path("<str:token>/items/<int:item_id>/comments", PublicCalendarCommentsView.as_view()),
]
