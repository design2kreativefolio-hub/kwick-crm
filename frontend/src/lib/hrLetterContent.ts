// Mirrors backend/hr/letter_content.py

export const DOC_TYPES = [
  { value: "handover_letter", label: "Handover Letter", assignable: true },
  { value: "experience_letter", label: "Experience Letter", assignable: true },
  { value: "payslip_letter", label: "Payslip Letter", assignable: true },
  { value: "relieving_letter", label: "Relieving Letter", assignable: true },
  { value: "probation_confirmation", label: "Probation Confirmation Letter", assignable: true },
  { value: "warning_letter", label: "Warning Letter", assignable: true },
  { value: "increment_letter", label: "Increment Letter", assignable: true },
  { value: "offer_letter", label: "Offer Letter", assignable: false },
] as const;

export type DocType = (typeof DOC_TYPES)[number]["value"];

export type LetterContent = Record<string, any>;

const today = () => new Date().toISOString().slice(0, 10);

export function defaultLetterContent(docType: DocType): LetterContent {
  const common = {
    date: today(),
    employee_name: "",
    job_title: "",
    department: "",
    contact_info: "",
  };
  switch (docType) {
    case "handover_letter":
      return {
        ...common,
        last_working_day: null,
        phone: "",
        email: "",
        responsibilities:
          "Provide a comprehensive list of your current responsibilities, tasks, and any ongoing projects. Include details of tasks pending and any important deadlines or milestones.",
        key_contacts:
          "Ensure all critical contacts, including clients, suppliers, and colleagues, are listed with updated details. Any relevant project information that needs to be passed on should be clearly documented.",
        documentation_notes:
          "Document the location of all work-related documents, including files on shared drives, cloud storage, physical files, and any other important records. Specify where these files can be accessed by the team.",
        property_notes:
          "Please confirm the return of all company property, including but not limited to:\nLaptop/Computer\nMobile Phone\nID/Access Cards\nKeys or other company assets\nAny other items assigned to you during your tenure",
        system_access_notes:
          "Ensure that all login credentials and system access have been handed over appropriately. Provide details of any necessary password changes or updates.",
        accounts_notes:
          "For employees in financial roles, please ensure that all pending transactions, invoices, accounts, and financial records are properly transferred or documented for the successor.",
      };
    case "experience_letter":
      return {
        ...common,
        start_date: null,
        end_date: null,
        pronoun: "their",
        achievements:
          "demonstrated excellent skills and professionalism. Their contributions were significant in achieving our company's goals.",
        closing:
          "was a dedicated and reliable employee, and their positive attitude and collaborative spirit were greatly appreciated. We are confident that they will be an asset to any future employer.",
      };
    case "payslip_letter":
      return {
        ...common,
        period: "",
        employee_id: "",
        date_of_joining: null,
        bank_name: "",
        bank_account: "",
        payment_mode: "Bank Transfer",
        absent_days: "0",
        days_worked: "",
        basic: "",
        housing_allowance: "",
        leave_salary: "",
        other_earnings: "",
        absent_deductions: "",
        other_deductions: "",
        net_in_words: "",
      };
    case "relieving_letter":
      return {
        ...common,
        resignation_date: null,
        last_working_date: null,
        body_extra:
          "We confirm that you have been relieved from your duties with Kreativefolio Marketing Management LLC as of the mentioned date, and all exit formalities, including the handover process, have been duly completed. Your full and final settlement will be processed as per company policy.",
      };
    case "probation_confirmation":
      return {
        ...common,
        effective_date: null,
        probation_months: "6",
        strengths:
          "strong communication skills, excellent attention to detail, and a proactive approach to problem-solving. Your dedication, professionalism, and commitment to meeting project deadlines have been commendable, and we are confident that you will continue to make valuable contributions to our team.",
      };
    case "warning_letter":
      return {
        ...common,
        subject: "Warning for Negligence and Non-Compliance",
        incident_summary: "",
        details: "",
        response_hours: "48",
        acknowledgment_name: "",
      };
    case "increment_letter":
      return {
        ...common,
        effective_date: null,
        current_salary: "",
        new_salary: "",
      };
    case "offer_letter":
      return {
        ...common,
        reporting_date: null,
        valid_until: null,
        basic_salary: "",
        basic_salary_words: "",
        hra: "",
        hra_words: "",
        other_allowance: "",
        other_allowance_words: "",
        total_salary: "",
        total_salary_words: "",
        probation_months: "6",
        notice_period: "two months' notice",
        include_commission: false,
        include_telephone: false,
      };
    default:
      return common;
  }
}

const HANDOVER_TEXT_KEYS = [
  "responsibilities",
  "key_contacts",
  "documentation_notes",
  "property_notes",
  "system_access_notes",
  "accounts_notes",
] as const;

export function mergedLetterContent(docType: DocType, raw?: LetterContent | null): LetterContent {
  const base = defaultLetterContent(docType);
  const incoming = raw || {};
  const merged = { ...base, ...incoming };
  if (docType === "handover_letter") {
    for (const key of HANDOVER_TEXT_KEYS) {
      if (!merged[key]) merged[key] = base[key];
    }
  }
  return merged;
}

export function isAssignable(docType: DocType): boolean {
  return DOC_TYPES.find((d) => d.value === docType)?.assignable ?? false;
}

export function docTypeLabel(docType: string): string {
  return DOC_TYPES.find((d) => d.value === docType)?.label || docType;
}
