"""Canonical shape of HrLetter.content — mirrored in frontend/src/lib/hrLetterContent.ts."""

from copy import deepcopy


DOC_TYPES = [
    ("handover_letter", "Handover Letter"),
    ("experience_letter", "Experience Letter"),
    ("payslip_letter", "Payslip Letter"),
    ("relieving_letter", "Relieving Letter"),
    ("probation_confirmation", "Probation Confirmation Letter"),
    ("warning_letter", "Warning Letter"),
    ("increment_letter", "Increment Letter"),
    ("offer_letter", "Offer Letter"),
]

DOC_TYPE_LABELS = dict(DOC_TYPES)
ASSIGNABLE_DOC_TYPES = {k for k, _ in DOC_TYPES if k != "offer_letter"}

COMPANY_NAME = "Kreativefolio Marketing Management LLC"
COMPANY_SHORT = "Kreativefolio Marketing Management LLC"


def _base_common():
    return {
        "date": None,
        "employee_name": "",
        "job_title": "",
        "department": "",
        "contact_info": "",
    }


DEFAULTS = {
    "handover_letter": {
        **_base_common(),
        "last_working_day": None,
        "phone": "",
        "email": "",
        "responsibilities": (
            "Provide a comprehensive list of your current responsibilities, tasks, and any "
            "ongoing projects. Include details of tasks pending and any important deadlines or milestones."
        ),
        "key_contacts": (
            "Ensure all critical contacts, including clients, suppliers, and colleagues, are listed "
            "with updated details. Any relevant project information that needs to be passed on should "
            "be clearly documented."
        ),
        "documentation_notes": (
            "Document the location of all work-related documents, including files on shared drives, "
            "cloud storage, physical files, and any other important records. Specify where these files "
            "can be accessed by the team."
        ),
        "property_notes": (
            "Please confirm the return of all company property, including but not limited to:\n"
            "Laptop/Computer\n"
            "Mobile Phone\n"
            "ID/Access Cards\n"
            "Keys or other company assets\n"
            "Any other items assigned to you during your tenure"
        ),
        "system_access_notes": (
            "Ensure that all login credentials and system access have been handed over appropriately. "
            "Provide details of any necessary password changes or updates."
        ),
        "accounts_notes": (
            "For employees in financial roles, please ensure that all pending transactions, invoices, "
            "accounts, and financial records are properly transferred or documented for the successor."
        ),
    },
    "experience_letter": {
        **_base_common(),
        "start_date": None,
        "end_date": None,
        "pronoun": "their",  # his/her/their
        "achievements": (
            "demonstrated excellent skills and professionalism. "
            "Their contributions were significant in achieving our company's goals."
        ),
        "closing": (
            "was a dedicated and reliable employee, and their positive attitude and "
            "collaborative spirit were greatly appreciated. We are confident that they "
            "will be an asset to any future employer."
        ),
    },
    "payslip_letter": {
        **_base_common(),
        "period": "",
        "employee_id": "",
        "date_of_joining": None,
        "bank_name": "",
        "bank_account": "",
        "payment_mode": "Bank Transfer",
        "absent_days": "0",
        "days_worked": "",
        "basic": "",
        "housing_allowance": "",
        "leave_salary": "",
        "other_earnings": "",
        "absent_deductions": "",
        "other_deductions": "",
        "net_in_words": "",
    },
    "relieving_letter": {
        **_base_common(),
        "resignation_date": None,
        "last_working_date": None,
        "body_extra": (
            "We confirm that you have been relieved from your duties with Kreativefolio "
            "Marketing Management LLC as of the mentioned date, and all "
            "exit formalities, including the handover process, have been duly completed. "
            "Your full and final settlement will be processed as per company policy."
        ),
    },
    "probation_confirmation": {
        **_base_common(),
        "effective_date": None,
        "probation_months": "6",
        "strengths": (
            "strong communication skills, excellent attention to detail, and a proactive "
            "approach to problem-solving. Your dedication, professionalism, and commitment "
            "to meeting project deadlines have been commendable, and we are confident that "
            "you will continue to make valuable contributions to our team."
        ),
    },
    "warning_letter": {
        **_base_common(),
        "subject": "Warning for Negligence and Non-Compliance",
        "incident_summary": "",
        "details": "",
        "response_hours": "48",
        "acknowledgment_name": "",
    },
    "increment_letter": {
        **_base_common(),
        "effective_date": None,
        "current_salary": "",
        "new_salary": "",
    },
    "offer_letter": {
        **_base_common(),
        "reporting_date": None,
        "valid_until": None,
        "basic_salary": "",
        "basic_salary_words": "",
        "hra": "",
        "hra_words": "",
        "other_allowance": "",
        "other_allowance_words": "",
        "total_salary": "",
        "total_salary_words": "",
        "probation_months": "6",
        "notice_period": "two months' notice",
        "include_commission": False,
        "include_telephone": False,
    },
}


def default_content(doc_type: str) -> dict:
    base = deepcopy(DEFAULTS.get(doc_type) or _base_common())
    return base


def merged_content(doc_type: str, raw: dict | None) -> dict:
    base = default_content(doc_type)
    raw = raw or {}
    for key, default_value in base.items():
        if key not in raw or raw[key] is None:
            continue
        # Empty checklist text falls back to the canned handover prompts.
        if (
            doc_type == "handover_letter"
            and key
            in {
                "responsibilities",
                "key_contacts",
                "documentation_notes",
                "property_notes",
                "system_access_notes",
                "accounts_notes",
            }
            and raw[key] == ""
            and default_value
        ):
            continue
        base[key] = raw[key]
    return base


def letter_title(doc_type: str, content: dict) -> str:
    label = DOC_TYPE_LABELS.get(doc_type, doc_type)
    name = (content or {}).get("employee_name") or ""
    return f"{label} — {name}".strip(" —") if name else label
