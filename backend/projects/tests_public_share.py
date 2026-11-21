from datetime import date

from django.test import TestCase
from rest_framework.test import APIClient

from projects.models import ClientCalendarShare, ContentCalendarItem
from sales.models import Client

SHARED = ["carousel", "reel", "static_post", "story"]
ALL_TYPES = SHARED + ["print", "video", "design", "shoot", "ad", "website", "other"]


class ClientShareTypeTests(TestCase):
    """The client's shared calendar link only carries Static Post, Reel, Story and Carousel."""

    def setUp(self):
        self.client_obj = Client.objects.create(name="Acme")
        self.share = ClientCalendarShare.objects.create(client=self.client_obj)
        self.items = {
            t: ContentCalendarItem.objects.create(
                client=self.client_obj, content_type=t, title=f"item {t}", scheduled_date=date(2026, 11, 5)
            )
            for t in ALL_TYPES
        }

    def url(self, suffix=""):
        return f"/api/public/calendar/{self.share.token}{suffix}"

    def test_only_social_post_types_are_listed(self):
        data = APIClient().get(self.url()).json()
        self.assertEqual(sorted(i["content_type"] for i in data["items"]), SHARED)

    def test_hidden_items_cannot_be_reached_by_id(self):
        for t in ALL_TYPES:
            r = APIClient().get(self.url(f"/items/{self.items[t].id}/comments"))
            self.assertEqual(r.status_code, 200 if t in SHARED else 404, t)
