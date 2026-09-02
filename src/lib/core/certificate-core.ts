/**
 * Certificate vocabulary and the fields each type must carry.
 *
 * A Transfer Certificate is a legal document: the next school will not admit a
 * child without it, and a board can ask to see it years later. So each type
 * declares exactly what has to be filled, and nothing is invented at print time.
 */

export const CERTIFICATE_TYPES = [
  {
    value: "TRANSFER",
    label: "Transfer Certificate",
    short: "TC",
    sequenceKind: "CERT_TRANSFER",
    prefix: "TC/",
    blurb: "Required by the next school before it can admit the child.",
  },
  {
    value: "BONAFIDE",
    label: "Bonafide Certificate",
    short: "Bonafide",
    sequenceKind: "CERT_BONAFIDE",
    prefix: "BC/",
    blurb: "Proof the child is on the roll — for passports, banks, scholarships.",
  },
  {
    value: "CHARACTER",
    label: "Character Certificate",
    short: "Character",
    sequenceKind: "CERT_CHARACTER",
    prefix: "CC/",
    blurb: "A statement of conduct, usually issued alongside the TC.",
  },
  {
    value: "STUDY",
    label: "Study Certificate",
    short: "Study",
    sequenceKind: "CERT_STUDY",
    prefix: "SC/",
    blurb: "Confirms the years a child studied here.",
  },
  {
    value: "CONDUCT",
    label: "Conduct Certificate",
    short: "Conduct",
    sequenceKind: "CERT_CONDUCT",
    prefix: "CN/",
    blurb: "Conduct during a stated period.",
  },
  {
    value: "FEE_PAID",
    label: "Fee Paid Certificate",
    short: "Fee paid",
    sequenceKind: "CERT_FEE",
    prefix: "FP/",
    blurb: "Fees cleared up to a date — often needed for reimbursement.",
  },
] as const;

export type CertificateTypeValue = (typeof CERTIFICATE_TYPES)[number]["value"];

export function certificateMeta(type: string) {
  return CERTIFICATE_TYPES.find((t) => t.value === type) ?? CERTIFICATE_TYPES[0];
}

export const CONDUCT_OPTIONS = ["Excellent", "Very Good", "Good", "Satisfactory"] as const;

export const LEAVING_REASONS = [
  "Parent's transfer",
  "Shifting residence",
  "At parent's request",
  "Completed the highest class in this school",
  "Admission to another school",
  "Long absence",
] as const;

/**
 * Date of birth in words is a mandatory field on an Indian TC — it exists
 * precisely so the figure cannot be altered later.
 */
export function dateInWords(d: Date): string {
  const day = d.getUTCDate();
  const month = d.toLocaleDateString("en-IN", { month: "long", timeZone: "UTC" });
  const year = d.getUTCFullYear();
  return `${ordinalWords(day)} ${month} ${yearInWords(year)}`;
}

const ONES = [
  "", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine", "Ten",
  "Eleven", "Twelve", "Thirteen", "Fourteen", "Fifteen", "Sixteen", "Seventeen",
  "Eighteen", "Nineteen",
];
const TENS = ["", "", "Twenty", "Thirty", "Forty", "Fifty", "Sixty", "Seventy", "Eighty", "Ninety"];

const ORDINALS: Record<number, string> = {
  1: "First", 2: "Second", 3: "Third", 5: "Fifth", 8: "Eighth", 9: "Ninth", 12: "Twelfth",
  20: "Twentieth", 30: "Thirtieth",
};

function ordinalWords(n: number): string {
  if (ORDINALS[n]) return ORDINALS[n];
  if (n < 20) return `${ONES[n]}th`;

  const tens = Math.floor(n / 10) * 10;
  const unit = n % 10;
  if (unit === 0) return ORDINALS[tens] ?? `${TENS[tens / 10]}th`;
  return `${TENS[tens / 10]}-${ORDINALS[unit] ?? `${ONES[unit]}th`}`;
}

function yearInWords(year: number): string {
  // Indian certificates write years as "Two Thousand Fifteen", not "Twenty Fifteen".
  const thousands = Math.floor(year / 1000);
  const remainder = year % 1000;
  const hundreds = Math.floor(remainder / 100);
  const rest = remainder % 100;

  const parts = [`${ONES[thousands]} Thousand`];
  if (hundreds > 0) parts.push(`${ONES[hundreds]} Hundred`);
  if (rest > 0) parts.push(under100(rest));
  return parts.join(" ");
}

function under100(n: number): string {
  if (n < 20) return ONES[n];
  const t = Math.floor(n / 10);
  const o = n % 10;
  return o === 0 ? TENS[t] : `${TENS[t]} ${ONES[o]}`;
}
