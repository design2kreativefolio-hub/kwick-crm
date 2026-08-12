"""Pure-SVG charts for WeasyPrint report PDFs (no JS / no extra deps)."""

from __future__ import annotations

import math
from html import escape


NAVY = "#1c1e54"
MUTED = "#5b6178"
GRID = "#e8eaf2"
COLORS = ["#1c1e54", "#3673fc", "#1E9E62", "#D97706", "#0EA5E9", "#64748B"]


def _n(v) -> float:
    try:
        return float(v or 0)
    except (TypeError, ValueError):
        return 0.0


def bar_chart_svg(
    items: list[tuple[str, float | int, str | None]],
    *,
    width: int = 520,
    height: int = 168,
) -> str:
    """Horizontal-ish vertical bar chart. items: (label, value, optional color)."""
    if not items:
        return ""
    pad_l, pad_r, pad_t, pad_b = 36, 16, 12, 36
    chart_w = width - pad_l - pad_r
    chart_h = height - pad_t - pad_b
    values = [_n(v) for _, v, _ in items]
    vmax = max(values) if any(values) else 1.0
    n = len(items)
    gap = 10
    bar_w = max(18, (chart_w - gap * (n - 1)) / n)

    parts = [
        f'<svg xmlns="http://www.w3.org/2000/svg" width="{width}" height="{height}" '
        f'viewBox="0 0 {width} {height}">'
    ]
    # baseline
    parts.append(
        f'<line x1="{pad_l}" y1="{pad_t + chart_h}" x2="{width - pad_r}" y2="{pad_t + chart_h}" '
        f'stroke="{GRID}" stroke-width="1"/>'
    )
    for i, (label, raw, color) in enumerate(items):
        val = _n(raw)
        h = (val / vmax) * chart_h if vmax else 0
        x = pad_l + i * (bar_w + gap)
        y = pad_t + chart_h - h
        fill = color or COLORS[i % len(COLORS)]
        parts.append(
            f'<rect x="{x:.1f}" y="{y:.1f}" width="{bar_w:.1f}" height="{max(h, 1):.1f}" '
            f'rx="4" fill="{fill}"/>'
        )
        parts.append(
            f'<text x="{x + bar_w / 2:.1f}" y="{y - 4:.1f}" text-anchor="middle" '
            f'font-family="Helvetica, Arial, sans-serif" font-size="10" font-weight="700" '
            f'fill="{NAVY}">{escape(str(int(val) if val == int(val) else round(val, 1)))}</text>'
        )
        parts.append(
            f'<text x="{x + bar_w / 2:.1f}" y="{pad_t + chart_h + 14:.1f}" text-anchor="middle" '
            f'font-family="Helvetica, Arial, sans-serif" font-size="8.5" fill="{MUTED}">'
            f"{escape(str(label)[:14])}</text>"
        )
    parts.append("</svg>")
    return "".join(parts)


def donut_chart_svg(
    slices: list[tuple[str, float | int, str | None]],
    *,
    size: int = 150,
) -> str:
    """Simple donut with legend labels to the right (returned as full width SVG)."""
    if not slices:
        return ""
    total = sum(_n(v) for _, v, _ in slices) or 1.0
    cx = cy = size / 2
    r_out, r_in = size * 0.42, size * 0.26
    legend_x = size + 16
    width = size + 170
    height = max(size, 18 * len(slices) + 20)

    def arc(start: float, end: float, color: str) -> str:
        if end - start <= 0:
            return ""
        # Full circle special-case
        if end - start >= 2 * math.pi - 1e-6:
            return (
                f'<circle cx="{cx}" cy="{cy}" r="{(r_out + r_in) / 2:.2f}" '
                f'fill="none" stroke="{color}" stroke-width="{r_out - r_in:.2f}"/>'
            )
        large = 1 if end - start > math.pi else 0

        def pt(ang: float, r: float) -> tuple[float, float]:
            return cx + r * math.cos(ang), cy + r * math.sin(ang)

        x0, y0 = pt(start, r_out)
        x1, y1 = pt(end, r_out)
        x2, y2 = pt(end, r_in)
        x3, y3 = pt(start, r_in)
        return (
            f'<path d="M {x0:.2f} {y0:.2f} A {r_out:.2f} {r_out:.2f} 0 {large} 1 {x1:.2f} {y1:.2f} '
            f'L {x2:.2f} {y2:.2f} A {r_in:.2f} {r_in:.2f} 0 {large} 0 {x3:.2f} {y3:.2f} Z" '
            f'fill="{color}"/>'
        )

    parts = [
        f'<svg xmlns="http://www.w3.org/2000/svg" width="{width}" height="{height}" '
        f'viewBox="0 0 {width} {height}">'
    ]
    # Start from top (-90°)
    angle = -math.pi / 2
    for i, (label, raw, color) in enumerate(slices):
        val = _n(raw)
        sweep = (val / total) * 2 * math.pi
        fill = color or COLORS[i % len(COLORS)]
        if val > 0:
            parts.append(arc(angle, angle + sweep, fill))
        angle += sweep
        ly = 22 + i * 20
        parts.append(
            f'<rect x="{legend_x}" y="{ly - 8}" width="9" height="9" rx="2" fill="{fill}"/>'
            f'<text x="{legend_x + 14}" y="{ly}" font-family="Helvetica, Arial, sans-serif" '
            f'font-size="9.5" fill="{NAVY}">{escape(str(label))} '
            f'<tspan font-weight="700">{int(val) if val == int(val) else round(val, 1)}</tspan></text>'
        )

    parts.append(
        f'<text x="{cx}" y="{cy - 4}" text-anchor="middle" font-family="Helvetica, Arial, sans-serif" '
        f'font-size="9" fill="{MUTED}">Total</text>'
        f'<text x="{cx}" y="{cy + 14}" text-anchor="middle" font-family="Helvetica, Arial, sans-serif" '
        f'font-size="16" font-weight="800" fill="{NAVY}">{int(total)}</text>'
    )
    parts.append("</svg>")
    return "".join(parts)


def build_report_charts(report: dict) -> dict:
    """Return SVG strings for the PDF template based on report type."""
    s = report.get("summary") or {}
    rtype = report.get("type")

    if rtype == "employee":
        overview = [
            ("Completed", s.get("tasks_completed", 0), "#1E9E62"),
            ("Open", s.get("tasks_open", 0), "#3673fc"),
            ("Projects", s.get("projects", 0), "#1c1e54"),
            ("Tracker", s.get("daily_tracker_entries", 0), "#0EA5E9"),
            ("Leave", s.get("leave_days", 0), "#D97706"),
        ]
        # Priority mix from completed + open
        pri: dict[str, int] = {}
        for t in (report.get("tasks_completed") or []) + (report.get("tasks_open") or []):
            key = (t.get("priority") or "normal").title()
            pri[key] = pri.get(key, 0) + 1
        priority_colors = {"High": "#DC2626", "Medium": "#D97706", "Normal": "#3673fc", "Low": "#64748B"}
        priority_slices = [
            (k, v, priority_colors.get(k, COLORS[i % len(COLORS)]))
            for i, (k, v) in enumerate(sorted(pri.items(), key=lambda x: -x[1]))
        ] or [("No tasks", 1, GRID)]

        return {
            "overview_svg": bar_chart_svg(overview),
            "breakdown_svg": donut_chart_svg(priority_slices),
            "breakdown_title": "Task priority mix",
            "overview_title": "Activity overview",
        }

    overview = [
        ("Projects", s.get("projects", 0), "#1c1e54"),
        ("Content", s.get("content_items", 0), "#3673fc"),
        ("Tasks", s.get("tasks", 0), "#0EA5E9"),
        ("Renewals", s.get("renewals", 0), "#D97706"),
        ("Invoices", s.get("invoices", 0), "#1E9E62"),
    ]
    paid = _n(s.get("invoiced_paid"))
    overdue = _n(s.get("invoiced_overdue"))
    total = _n(s.get("invoiced_total"))
    other = max(total - paid - overdue, 0)
    money_slices = [
        ("Paid", paid, "#1E9E62"),
        ("Overdue", overdue, "#DC2626"),
        ("Outstanding", other, "#D97706"),
    ]
    if total <= 0:
        money_slices = [("No invoices", 1, GRID)]

    # Content status mix
    status_counts: dict[str, int] = {}
    for c in report.get("content_calendar") or []:
        key = (c.get("status") or "other").replace("_", " ").title()
        status_counts[key] = status_counts.get(key, 0) + 1
    content_slices = [
        (k, v, COLORS[i % len(COLORS)])
        for i, (k, v) in enumerate(sorted(status_counts.items(), key=lambda x: -x[1]))
    ]

    return {
        "overview_svg": bar_chart_svg(overview),
        "breakdown_svg": donut_chart_svg(money_slices if total > 0 else content_slices or [("No data", 1, GRID)]),
        "breakdown_title": "Invoice amounts (AED)" if total > 0 else "Content status",
        "overview_title": "Workload overview",
    }
