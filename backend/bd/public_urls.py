from django.urls import path

from .public_views import CaptureView, PublicProposalAcceptView, PublicProposalView

# Mounted under "api/public/" — no authentication.
urlpatterns = [
    path("bd/capture/<str:token>", CaptureView.as_view()),
    path("proposals/<str:token>", PublicProposalView.as_view()),
    path("proposals/<str:token>/accept", PublicProposalAcceptView.as_view()),
]
