"""Artwork reference-number generator (spec §7) + mini-project → Tasks mirror."""
from datetime import date

from .models import ArtworkSequence, Project

COMPANY = "KF"  # Kreativefolio
SERIES_YEAR = 2024  # fixed series label — the numbering never resets/rolls to the real current year


def _initials(full_name: str) -> str:
    parts = [p for p in (full_name or "").split() if p]
    return "".join(p[0] for p in parts).upper()[:3] or "XX"


def build_artwork_id(
    *,
    company_name: str,
    country_code: str,
    product_name: str,
    designer_name: str,
    on: date | None = None,
) -> str:
    """
    Format:
      KF_{CompanyName}_{Country}_{ProductName}_{Designer}_{DDMMYY}_K-{SeriesYear}{Seq:04d}
    Example:
      KF_Acme_UAE_Cacao_RH_260730_K-20244001
    The {DDMMYY} segment is the real generation date, but the sequence's
    leading "year" digits are a fixed series label (SERIES_YEAR) rather than
    the actual current year — the count starts at 4001 and steps by 1000
    (4001, 5001, 6001, …) so suffixes read 20244001, 20245001, 20246001.
    Generated atomically per country_code via select_for_update.
    """
    on = on or date.today()
    seq = ArtworkSequence.next_number(year=SERIES_YEAR, category_code=country_code)
    return (
        f"{COMPANY}_{company_name}_{country_code}_{product_name}_{_initials(designer_name)}"
        f"_{on:%d%m%y}_K-{SERIES_YEAR}{seq:04d}"
    )


def sync_mini_project_task(project) -> None:
    """Keep a Tasks row in sync so assignees + superadmins see the mini-project
    as work. Does not send assignment notifications (ProjectViewSet already does)."""
    from django.contrib.auth import get_user_model

    from tasks.models import Task

    User = get_user_model()
    member_ids = list(project.members.values_list("id", flat=True))
    if not member_ids:
        if project.created_by_id:
            member_ids = [project.created_by_id]
        else:
            fallback = User.objects.filter(is_active=True).order_by("id").first()
            if fallback is None:
                return
            member_ids = [fallback.id]

    primary = User.objects.filter(id=member_ids[0]).first()
    if primary is None:
        return

    board_map = {
        Project.Status.ASSIGNED: Task.BoardStatus.TODO,
        Project.Status.IN_PROGRESS: Task.BoardStatus.DOING,
        Project.Status.COMPLETED: Task.BoardStatus.DONE,
        Project.Status.QC_COMPLETED: Task.BoardStatus.DONE,
        Project.Status.APPROVED: Task.BoardStatus.DONE,
    }
    published = project.status == Project.Status.APPROVED
    due_date = None if published else project.delivery_date
    board_status = board_map.get(project.status, Task.BoardStatus.TODO)

    from sales.models import Client

    client_name = (project.client or "").strip()
    client_obj = Client.objects.filter(name__iexact=client_name).first() if client_name else None

    task = Task.objects.filter(mini_project_id=project.pk).first()

    if task is None:
        task = Task.objects.create(
            mini_project=project,
            project=project,
            assignee=primary,
            title=project.name,
            description=project.description or "",
            client_name=client_name,
            client=client_obj,
            due_date=due_date,
            status=project.status,
            priority=project.priority,
            board_status=board_status,
        )
    else:
        task.assignee = primary
        task.project = project
        task.title = project.name
        task.description = project.description or ""
        task.client_name = client_name
        task.client = client_obj
        task.due_date = due_date
        task.status = project.status
        task.priority = project.priority
        task.board_status = board_status
        task.save(
            update_fields=[
                "assignee",
                "project",
                "title",
                "description",
                "client_name",
                "client",
                "due_date",
                "status",
                "priority",
                "board_status",
                "completed_at",
                "updated_at",
            ]
        )

    task.assignees.set(member_ids)
