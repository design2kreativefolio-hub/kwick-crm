import { DocType, LetterContent, docTypeLabel } from "./hrLetterContent";

const COMPANY = "Kreativefolio Marketing Management LLC";
const COMPANY_SHORT = "Kreativefolio Marketing Management LLC";

function esc(v: string | null | undefined): string {
  if (!v) return "";
  return v
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function fmtDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  const [y, m, d] = String(iso).split("-").map(Number);
  if (!y) return esc(String(iso));
  return new Date(y, m - 1, d).toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

function nl2br(v: string): string {
  return esc(v).replace(/\n/g, "<br />");
}

function num(v: unknown): number {
  const n = parseFloat(String(v ?? "").replace(/,/g, ""));
  return Number.isFinite(n) ? n : 0;
}

function money(v: unknown): string {
  if (v === "" || v == null) return "—";
  const n = num(v);
  return n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function bodyHtml(docType: DocType, c: LetterContent): string {
  const name = esc(c.employee_name) || "—";
  const title = esc(c.job_title) || "—";

  if (docType === "experience_letter") {
    return `
      <p class="salutation">To Whom It May Concern,</p>
      <p><strong>${name}</strong> was employed with <strong>${title}</strong> from <strong>${fmtDate(c.start_date)}</strong> to <strong>${fmtDate(c.end_date)}</strong>.</p>
      <p>During ${esc(c.pronoun) || "their"} tenure, ${name} ${esc(c.achievements)}</p>
      <p>${name} ${esc(c.closing)}</p>
      <p>We wish them all the best in their future endeavours.</p>
      ${c.contact_info ? `<p>${esc(c.contact_info)}</p>` : ""}
      <div class="sign-block"><p><strong>${COMPANY}</strong></p><div class="sign-line">Authorized Signatory</div></div>`;
  }

  if (docType === "handover_letter") {
    return `
      <p class="salutation">Dear ${name},</p>
      <p>As your employment with ${COMPANY_SHORT} is coming to an end${c.last_working_day ? ` (last working day: <strong>${fmtDate(c.last_working_day)}</strong>)` : ""}, we kindly request that you complete the formal handover of your responsibilities, files, and company property. This process is crucial for ensuring a smooth transition and continued workflow within the company.</p>
      <p>Please review and complete the necessary details as per the checklist below. Kindly return the signed copy of this letter, along with the required information, by the end of your last working day.</p>
      <h3 class="section">Handover Checklist</h3>
      <p><strong>1. Handover of Responsibilities</strong></p><p>${nl2br(c.responsibilities) || "—"}</p>
      <p><strong>2. Key Contacts and Critical Information</strong></p><p>${nl2br(c.key_contacts) || "—"}</p>
      <p><strong>3. Documentation and File Handover</strong></p><p>${nl2br(c.documentation_notes) || "—"}</p>
      <p><strong>4. Company Property</strong></p><p>${nl2br(c.property_notes) || "—"}</p>
      <p><strong>5. System Access and Credentials</strong></p><p>${nl2br(c.system_access_notes) || "—"}</p>
      <p><strong>6. Accounts and Financial Handover (If Applicable)</strong></p><p>${nl2br(c.accounts_notes) || "—"}</p>
      <div class="ack">
        <p><strong>Acknowledgement</strong></p>
        <p>I, <strong>${name}</strong>, confirm that I have completed the above-mentioned handover checklist and returned all company property. I understand that any delay or failure to complete the handover process may result in delays in the processing of my final pay check or other administrative actions.</p>
        <p>I also acknowledge that I remain bound by the confidentiality agreements and other terms outlined in my employment contract. I can be contacted at:</p>
        <p>Phone Number: ${esc(c.phone) || "______________________"}</p>
        <p>Email Address: ${esc(c.email) || "______________________"}</p>
      </div>
      <div class="sign-block"><div class="sign-line">Authorised Signatory</div></div>`;
  }

  if (docType === "relieving_letter") {
    return `
      <p class="salutation">Dear ${name},</p>
      <p>We refer to your resignation dated <strong>${fmtDate(c.resignation_date)}</strong>, and we hereby accept your resignation from the position of <strong>${title}</strong>${c.department ? ` in the <strong>${esc(c.department)}</strong> department` : ""}. Your last working day is <strong>${fmtDate(c.last_working_date)}</strong>.</p>
      <p>${esc(c.body_extra)}</p>
      <p>We appreciate your contributions during your tenure and wish you success in your future endeavours.</p>
      <div class="sign-block"><p><strong>${COMPANY}</strong></p><div class="sign-line">Authorized Signatory</div></div>`;
  }

  if (docType === "probation_confirmation") {
    return `
      <p class="salutation">Dear ${name},</p>
      <p>We are pleased to inform you that you have successfully completed the probationary period of <strong>${esc(c.probation_months) || "6"} months</strong> as <strong>${title}</strong> with ${COMPANY}.</p>
      <p>Throughout your probationary period, you have consistently demonstrated ${esc(c.strengths)}</p>
      <p>Effective <strong>${fmtDate(c.effective_date)}</strong>, your employment status will transition from probationary to permanent.</p>
      <div class="sign-block"><p><strong>${COMPANY}</strong></p><div class="sign-line">Authorized Signatory</div></div>`;
  }

  if (docType === "warning_letter") {
    return `
      <p class="meta">Employee Name: <strong>${name}</strong></p>
      <p class="meta">Employee Position: <strong>${title}</strong></p>
      <p class="salutation">Dear ${name},</p>
      <p><strong>${esc(c.subject) || "Formal Warning"}</strong></p>
      <p>${nl2br(c.incident_summary)}</p>
      <p>${nl2br(c.details)}</p>
      <p>Please provide a written response within <strong>${esc(c.response_hours) || "48"} hours</strong>.</p>
      <div class="sign-block"><p><strong>${COMPANY}</strong></p><div class="sign-line">Authorized Signatory</div></div>
      <div class="ack"><p><strong>Acknowledgment</strong></p><p>I, ${esc(c.acknowledgment_name) || name}, acknowledge receipt of this warning letter.</p></div>`;
  }

  if (docType === "increment_letter") {
    return `
      <p class="meta">Employee Name: <strong>${name}</strong></p>
      <p class="meta">Designation: <strong>${title}</strong></p>
      <p class="salutation">Dear ${name},</p>
      <p>We are pleased to inform you of your salary increase effective <strong>${fmtDate(c.effective_date)}</strong>. Your current salary of AED <strong>${esc(c.current_salary) || "—"}</strong> will be increased to AED <strong>${esc(c.new_salary) || "—"}</strong>.</p>
      <p>Your compensation details are strictly confidential.</p>
      <div class="sign-block"><p><strong>${COMPANY_SHORT}</strong></p><div class="sign-line">Authorized signature</div></div>`;
  }

  if (docType === "payslip_letter") {
    const earn = num(c.basic) + num(c.housing_allowance) + num(c.leave_salary) + num(c.other_earnings);
    const ded = num(c.absent_deductions) + num(c.other_deductions);
    const net = earn - ded;
    return `
      <p class="meta">Payslip for the period of: <strong>${esc(c.period) || "—"}</strong></p>
      <table class="pay">
        <tr><th>Employee ID</th><td>${esc(c.employee_id) || "—"}</td><th>Employee Name</th><td>${name}</td></tr>
        <tr><th>Date of joining</th><td>${fmtDate(c.date_of_joining)}</td><th>Designation</th><td>${title}</td></tr>
        <tr><th>Bank Name</th><td>${esc(c.bank_name) || "—"}</td><th>Bank A/C No</th><td>${esc(c.bank_account) || "—"}</td></tr>
        <tr><th>Payment Mode</th><td>${esc(c.payment_mode) || "—"}</td><th>Days / Absent</th><td>${esc(c.days_worked) || "—"} / ${esc(c.absent_days) || "0"}</td></tr>
      </table>
      <table class="pay">
        <thead><tr><th>Earnings</th><th class="num">AED</th><th>Deduction</th><th class="num">AED</th></tr></thead>
        <tbody>
          <tr><td>Basic</td><td class="num">${money(c.basic)}</td><td>Absent deductions</td><td class="num">${money(c.absent_deductions)}</td></tr>
          <tr><td>Housing Allowance</td><td class="num">${money(c.housing_allowance)}</td><td>Other Deduction</td><td class="num">${money(c.other_deductions)}</td></tr>
          <tr><td>Leave Salary</td><td class="num">${money(c.leave_salary)}</td><td></td><td></td></tr>
          <tr><td>Other Earnings</td><td class="num">${money(c.other_earnings)}</td><td></td><td></td></tr>
          <tr><th>Total</th><th class="num">${money(earn)}</th><th>Total</th><th class="num">${money(ded)}</th></tr>
          <tr><th colspan="2">Net payable</th><th colspan="2" class="num">${money(net)}</th></tr>
        </tbody>
      </table>
      <p>Net Payable in Words: <strong>${esc(c.net_in_words) || "—"}</strong></p>`;
  }

  if (docType === "offer_letter") {
    const commission = c.include_commission
      ? `<li>Commission: As per the company incentive schemes, applicable upon completion of the probationary period. (exclusive to Business Development Executives)</li>`
      : "";
    const telephone = c.include_telephone
      ? `<li>Telephone Allowance: The company will provide a telephone allowance (exclusive to Business Development Executives).</li>`
      : "";
    return `
      <p class="meta">Employee Name: <strong>${name}</strong></p>
      <p class="meta">Designation: <strong>${title}</strong> at ${COMPANY}</p>
      <p>
        This letter serves as your official appointment, effective from the date of your reporting to duty at our
        ${COMPANY_SHORT}
        ${c.reporting_date ? `(<strong>${fmtDate(c.reporting_date)}</strong>)` : ""},
        and this offer remains valid
        ${c.valid_until ? `until <strong>${fmtDate(c.valid_until)}</strong>` : "until that date"}
        unless extended or communicated otherwise in writing.
      </p>
      <p><strong>Below are the terms of offer:</strong></p>
      <p><strong>Compensation:</strong> Your Gross Monthly Compensation is as follows:</p>
      <table class="offer">
        <thead><tr><th>Components</th><th class="num">Amount</th><th>In words</th></tr></thead>
        <tbody>
          <tr><td>Basic Salary</td><td class="num">AED ${esc(c.basic_salary) || "—"}</td><td>${esc(c.basic_salary_words) || "—"}</td></tr>
          <tr><td>HRA</td><td class="num">AED ${esc(c.hra) || "—"}</td><td>${esc(c.hra_words) || "—"}</td></tr>
          <tr><td>Other Allowance</td><td class="num">AED ${esc(c.other_allowance) || "—"}</td><td>${esc(c.other_allowance_words) || "—"}</td></tr>
          <tr><th>Total</th><th class="num">AED ${esc(c.total_salary) || "—"}</th><th>${esc(c.total_salary_words) || "—"}</th></tr>
        </tbody>
      </table>
      <p><strong>Benefits:</strong> As an employee of ${COMPANY}, you will be eligible for our comprehensive benefits package, which includes:</p>
      <ul class="check">
        <li>The company's medical insurance benefits will be allocated solely to the employee.</li>
        <li>The company will sponsor the necessary visa for the employee to legally work in UAE.</li>
        <li>You shall be entitled to thirty (30) calendar days paid annual leave on a yearly basis.</li>
        <li>The company will initially provide one round-trip economy class air ticket between Dubai to your home country in two years.</li>
        ${commission}
        ${telephone}
      </ul>
      <p><strong>Working Hours:</strong> The hours of work will be a minimum of 48 hours a week. At times, work demands may necessitate additional working hours.</p>
      <p>
        <strong>Probationary Period:</strong> You will be under probation for a period of
        ${esc(c.probation_months) || "6"} months from the date of joining. During this probationary period, the
        company reserves the right to terminate your services at its discretion, without assigning any reason and
        without providing any notice or notice pay. Upon completion of the probationary period, your performance will
        be assessed, and you may be considered, at the company's sole discretion, for confirmation of employment.
      </p>
      <p>
        <strong>Notice Period / Termination:</strong> In the event of resignation, you are required to provide
        ${esc(c.notice_period) || "two months' notice"}.
      </p>
      <p>
        Your compensation details are strictly confidential, and you may discuss it only with the authorized personnel
        of HR in case of any clarification.
      </p>
      <p>
        It is our hope that your acceptance of this offer will be just the beginning of a mutually rewarding relationship.
        As a token of your acceptance of this offer of Employment, please sign a copy of this letter and return the same
        to our HR Department.
      </p>
      <p>We look forward to welcoming you on board at Kreativefolio.</p>
      <p class="signoff">Yours sincerely,</p>
      <div class="sign-block">
        <p><strong>${COMPANY}</strong></p>
        <div class="sign-line">Authorized Signatory</div>
      </div>
      <div class="ack">
        <p>I accept the position on the terms and conditions of the employment offered.</p>
        <p>(Signature of the Candidate) &nbsp;&nbsp; Date: _______________________</p>
      </div>`;
  }

  return `<p class="muted">Unknown letter type.</p>`;
}

export function buildLetterHtml(docType: DocType, content: LetterContent, _documentTitle?: string): string {
  const heading = docTypeLabel(docType);
  return `
  <img class="watermark" src="/hr/kwick-k-icon.png" alt="" />
  <div class="sheet">
    <table class="header">
      <tr>
        <td class="header-left">
          <p class="doc-title">${esc(heading)}</p>
          <p class="company">${COMPANY}</p>
          <p class="meta">Date: ${fmtDate(content.date)}</p>
        </td>
        <td class="header-right">
          <img class="brand-logo" src="/hr/logo.png" alt="Kreativefolio" />
        </td>
      </tr>
    </table>
    ${bodyHtml(docType, content)}
    <div class="powered-by">Powered By Kreativefolio</div>
  </div>`;
}
