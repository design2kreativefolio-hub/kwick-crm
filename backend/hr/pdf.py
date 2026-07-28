"""
Employee Collateral PDF generation.

TODO (spec §5.4 / §19):
  - One shared HTML template base powers all four collateral types.
  - Final copy/formatting for each letter still needs sign-off.
  - Render with WeasyPrint, upload to OVH Object Storage, return the file URL.

This stub returns a placeholder URL so the flow is wired end-to-end.
"""
from django.utils import timezone


def generate_collateral_pdf(collateral) -> str:
    # from weasyprint import HTML
    # html = render_to_string("hr/collateral_base.html", {"collateral": collateral})
    # pdf_bytes = HTML(string=html).write_pdf()
    # key = f"collaterals/{collateral.staff_id}/{collateral.doc_type}-{collateral.id}.pdf"
    # default_storage.save(key, ContentFile(pdf_bytes))  -> S3 when S3_ENABLED
    # return default_storage.url(key)
    stamp = timezone.now().strftime("%Y%m%d%H%M%S")
    return f"https://TODO-object-storage/collaterals/{collateral.staff_id}/{collateral.doc_type}-{stamp}.pdf"
