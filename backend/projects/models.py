from django.conf import settings
from django.db import models, transaction
from django.utils import timezone

from common.models import TimeStampedModel


class Project(TimeStampedModel):
    class Status(models.TextChoices):
        ASSIGNED = "assigned", "Assigned"
        IN_PROGRESS = "in_progress", "In Progress"
        COMPLETED = "completed", "Completed"
        QC_COMPLETED = "qc_completed", "QC Completed"
        APPROVED = "approved", "Approved / Published"

    # Closed enough to leave "ongoing" / open project lists.
    TERMINAL_STATUSES = frozenset(
        {Status.COMPLETED, Status.QC_COMPLETED, Status.APPROVED}
    )

    class Priority(models.TextChoices):
        LOW = "low", "Low"
        MEDIUM = "medium", "Medium"
        HIGH = "high", "High"

    name = models.CharField(max_length=200)
    description = models.TextField(blank=True, default="")
    # Free text, not a relation — picking (or typing) a client name here never
    # creates/touches a row in the real Clients directory. Only clients added
    # from the Clients page itself are ever suggested/selectable there.
    client = models.CharField(max_length=200, blank=True, default="")
    status = models.CharField(max_length=20, choices=Status.choices, default=Status.ASSIGNED)
    priority = models.CharField(max_length=10, choices=Priority.choices, default=Priority.MEDIUM)
    start_date = models.DateField(null=True, blank=True)
    end_date = models.DateField(null=True, blank=True)
    # Feeds the assigned employee's Calendar + a daily priority reminder
    # (projects/tasks.py check_project_deliveries) as it approaches/passes.
    delivery_date = models.DateField(null=True, blank=True)
    # Which staff are assigned (drives employee dashboard "ongoing projects", spec §15/§19).
    members = models.ManyToManyField(
        settings.AUTH_USER_MODEL, blank=True, related_name="projects"
    )
    # Who added this project — "assigned by" on the detail view. Server-set
    # only, never client-writable (see ProjectSerializer read_only_fields).
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="created_projects",
    )

    def __str__(self):
        return self.name


class ProjectClient(TimeStampedModel):
    """Short client token used in artwork IDs (e.g. 'Nevo'). Distinct from sales.Client."""

    name = models.CharField(max_length=100, unique=True)

    def __str__(self):
        return self.name


class CategoryCode(TimeStampedModel):
    """Repurposed as the artwork ID's country code (e.g. 'UAE', 'IN') — field
    name kept as-is to avoid a data migration, only the meaning/label changed."""

    code = models.CharField(max_length=10, unique=True)
    label = models.CharField(max_length=100, blank=True)

    def __str__(self):
        return self.code


class ArtworkType(TimeStampedModel):
    """e.g. 'Packaging_Design'."""

    name = models.CharField(max_length=100, unique=True)

    def __str__(self):
        return self.name


class ArtworkSequence(TimeStampedModel):
    """Per (year, category_code) running counter. `year` is generic here,
    but services.build_artwork_id always calls this with a fixed series
    year (SERIES_YEAR) rather than the real current year, so in practice
    the counter never resets — it just keeps incrementing per country_code.

    Numbers follow 4001, 5001, 6001, … (step of 1000) so the full id suffix
    reads as 20244001, 20245001, 20246001, …
    """

    STARTING_NUMBER = 4001
    STEP = 1000

    year = models.PositiveIntegerField()
    category_code = models.CharField(max_length=10)
    last_number = models.PositiveIntegerField(default=0)

    class Meta:
        unique_together = ("year", "category_code")

    @classmethod
    def next_number(cls, *, year: int, category_code: str) -> int:
        """Atomically advance to the next …001 series number (select_for_update)."""
        with transaction.atomic():
            seq, _ = cls.objects.select_for_update().get_or_create(
                year=year,
                category_code=category_code,
                defaults={"last_number": 0},
            )
            if seq.last_number < cls.STARTING_NUMBER:
                seq.last_number = cls.STARTING_NUMBER
            else:
                # Snap to next x001 (handles legacy +1 counters like 4006 → 5001).
                seq.last_number = (seq.last_number // cls.STEP + 1) * cls.STEP + 1
            seq.save(update_fields=["last_number", "updated_at"])
            return seq.last_number


class ContentCalendarItem(TimeStampedModel):
    """One scheduled social-media content item on a client's monthly content
    calendar (Projects > Clients > Calendar, spec follow-up)."""

    class ContentType(models.TextChoices):
        STATIC_POST = "static_post", "Static Post"
        REEL = "reel", "Reel"
        STORY = "story", "Story"
        VIDEO = "video", "Video"
        CAROUSEL = "carousel", "Carousel"
        OTHER = "other", "Other"

    class Status(models.TextChoices):
        # Same values/labels as tasks.Task.Status so mirrored tasks stay in sync.
        ASSIGNED = "assigned", "Assigned"
        IN_PROGRESS = "in_progress", "In Progress"
        COMPLETED = "completed", "Completed"
        QC_COMPLETED = "qc_completed", "QC Completed"
        APPROVED = "approved", "Approved / Published"

    TERMINAL_STATUSES = frozenset(
        {Status.COMPLETED, Status.QC_COMPLETED, Status.APPROVED}
    )

    client = models.ForeignKey(
        "sales.Client", on_delete=models.CASCADE, related_name="content_items"
    )
    content_type = models.CharField(
        max_length=20, choices=ContentType.choices, default=ContentType.STATIC_POST
    )
    title = models.CharField(max_length=200)
    description = models.TextField(blank=True, default="")
    scheduled_date = models.DateField()
    deadline = models.DateField(null=True, blank=True)
    deadline_time = models.TimeField(null=True, blank=True)
    status = models.CharField(max_length=20, choices=Status.choices, default=Status.ASSIGNED)
    assignees = models.ManyToManyField(
        settings.AUTH_USER_MODEL, blank=True, related_name="content_calendar_items"
    )
    attachment_url = models.URLField(blank=True, default="")
    # Extra files (up to 5 total including attachment_url legacy single).
    attachment_urls = models.JSONField(default=list, blank=True)
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        related_name="+",
    )

    class Meta:
        ordering = ["scheduled_date"]

    def __str__(self):
        return f"{self.title} ({self.client_id}, {self.scheduled_date})"


class Artwork(TimeStampedModel):
    project = models.ForeignKey(
        Project, on_delete=models.CASCADE, related_name="artworks", null=True, blank=True
    )
    # client: now "Company Name" in the UI — the ID's second segment (see
    # services.build_artwork_id). Field name kept to avoid a data migration.
    client = models.CharField(max_length=100, blank=True, default="")
    # artwork_type: no longer collected by the generator form, kept for
    # record-keeping only.
    artwork_type = models.CharField(max_length=100, blank=True, default="")
    # brand: now "Product Name" in the UI. category_code: now "Country Code"
    # in the UI. Field names kept to avoid a data migration.
    brand = models.CharField(max_length=100)
    category_code = models.CharField(max_length=10)
    designer = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, related_name="artworks"
    )
    artwork_id = models.CharField(max_length=255, unique=True)

    def __str__(self):
        return self.artwork_id
