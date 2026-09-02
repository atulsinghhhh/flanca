/**
 * Money in Flanca is ALWAYS an integer number of paise. Never a float, never a
 * string in the database. Rupee formatting happens only at the edge, here.
 */

export function paise(rupees: number): number {
  return Math.round(rupees * 100);
}

export function rupees(p: number): number {
  return p / 100;
}

/** "₹40,500" / "₹40,500.50" — Indian digit grouping, no decimals when whole. */
export function formatMoney(p: number, opts: { withSymbol?: boolean } = {}): string {
  const withSymbol = opts.withSymbol ?? true;
  const negative = p < 0;
  const abs = Math.abs(p);
  const whole = Math.floor(abs / 100);
  const fraction = abs % 100;

  const grouped = groupIndian(whole);
  const body = fraction === 0 ? grouped : `${grouped}.${String(fraction).padStart(2, "0")}`;

  return `${negative ? "−" : ""}${withSymbol ? "₹" : ""}${body}`;
}

/** Indian grouping: last three digits, then pairs. 1234567 → 12,34,567 */
export function groupIndian(n: number): string {
  const s = String(n);
  if (s.length <= 3) return s;
  const last3 = s.slice(-3);
  const rest = s.slice(0, -3);
  return `${rest.replace(/\B(?=(\d{2})+(?!\d))/g, ",")},${last3}`;
}

/** Words for cheques and receipts: "Forty Thousand Five Hundred Rupees Only" */
export function moneyInWords(p: number): string {
  const whole = Math.floor(Math.abs(p) / 100);
  const fraction = Math.abs(p) % 100;
  if (whole === 0 && fraction === 0) return "Zero Rupees Only";

  let out = whole > 0 ? `${numberToWords(whole)} Rupees` : "";
  if (fraction > 0) out += `${whole > 0 ? " and " : ""}${numberToWords(fraction)} Paise`;
  return `${out.trim()} Only`;
}

const ONES = [
  "", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine", "Ten",
  "Eleven", "Twelve", "Thirteen", "Fourteen", "Fifteen", "Sixteen", "Seventeen",
  "Eighteen", "Nineteen",
];
const TENS = ["", "", "Twenty", "Thirty", "Forty", "Fifty", "Sixty", "Seventy", "Eighty", "Ninety"];

function under100(n: number): string {
  if (n < 20) return ONES[n];
  const t = Math.floor(n / 10);
  const o = n % 10;
  return o === 0 ? TENS[t] : `${TENS[t]} ${ONES[o]}`;
}

/** Indian numbering: crore, lakh, thousand, hundred. */
export function numberToWords(n: number): string {
  if (n === 0) return "Zero";
  const parts: string[] = [];
  const units: Array<[number, string]> = [
    [10000000, "Crore"],
    [100000, "Lakh"],
    [1000, "Thousand"],
    [100, "Hundred"],
  ];

  let rest = n;
  for (const [value, label] of units) {
    const count = Math.floor(rest / value);
    if (count > 0) {
      parts.push(`${under100(count)} ${label}`);
      rest %= value;
    }
  }
  if (rest > 0) parts.push(under100(rest));
  return parts.join(" ").replace(/\s+/g, " ").trim();
}

/**
 * Money as a clerk actually types it: "13,700", "₹13,700", "13700.50", " 13,700 ".
 *
 * Every screen that took a typed amount used `Number(text) * 100` inline, and
 * `Number("13,700")` is NaN — so the fee counter showed ₹0 the moment a clerk typed
 * the comma the rest of the interface prints. Returns paise, or null when there is
 * no usable number, so a caller can tell "nothing typed" from "zero".
 */
export function paiseFromText(text: string | null | undefined): number | null {
  if (text == null) return null;
  const cleaned = String(text).replace(/[₹,\s]/g, "");
  if (cleaned === "" || cleaned === "." ) return null;
  if (!/^\d*\.?\d*$/.test(cleaned)) return null; // no signs, no letters, no two dots
  const n = Number(cleaned);
  if (!Number.isFinite(n)) return null;
  return Math.round(n * 100);
}
