import { formatMoney, moneyInWords } from "@/lib/core/money";

export type ReceiptSnapshot = {
  studentName?: string;
  admissionNumber?: string;
  className?: string;
  invoiceNumber?: string;
  term?: string | null;
  lineItems?: Array<{ head: string; amount: number; concession?: number }>;
  invoiceAmount?: number;
  lateFee?: number;
  amountPaid?: number;
  balanceAfter?: number;
  mode?: string;
  reference?: string | null;
  collectedByName?: string;
  paidAt?: string;
};

export type SchoolHeader = {
  name: string;
  address: string | null;
  phone: string | null;
  email: string | null;
  affiliationNo: string | null;
  udiseCode: string | null;
};

/**
 * A fee receipt is a physical object in an Indian school: it goes in a file, it
 * gets shown to an auditor, and a parent keeps it for years. So it prints on
 * plain A5/A4 from a cheap inkjet, in black, with the amount in words.
 */
export function ReceiptSheet({
  school,
  receiptNumber,
  issuedAt,
  snapshot,
  copyLabel = "Parent copy",
}: {
  school: SchoolHeader;
  receiptNumber: string;
  issuedAt: Date;
  snapshot: ReceiptSnapshot;
  copyLabel?: string;
}) {
  const lines = snapshot.lineItems ?? [];
  const gross = lines.reduce((a, l) => a + l.amount, 0);
  const concession = lines.reduce((a, l) => a + (l.concession ?? 0), 0);
  const lateFee = snapshot.lateFee ?? 0;
  const paid = snapshot.amountPaid ?? 0;
  const balance = snapshot.balanceAfter ?? 0;
  const invoiceTotal = snapshot.invoiceAmount ?? gross - concession + lateFee;
  // What the parent had already paid against this invoice before today. Without
  // this line the particulars (a full term) never reconcile with a part payment.
  const previouslyPaid = Math.max(0, invoiceTotal - paid - balance);

  return (
    <article className="mx-auto max-w-[760px] bg-white p-7 text-ink print:max-w-none print:p-0">
      {/* ── school header ── */}
      <header className="border-b-2 border-ink pb-3 text-center">
        <h1 className="font-display text-[22px] leading-tight font-bold tracking-tight">{school.name}</h1>
        {school.address ? <p className="mt-0.5 text-[12px]">{school.address}</p> : null}
        <p className="mt-0.5 text-[11.5px]">
          {[
            school.phone ? `Ph: ${school.phone}` : null,
            school.email,
            school.affiliationNo ? `Affiliation No: ${school.affiliationNo}` : null,
            school.udiseCode ? `UDISE: ${school.udiseCode}` : null,
          ]
            .filter(Boolean)
            .join("  ·  ")}
        </p>
      </header>

      <div className="mt-3 flex items-center justify-between">
        <p className="text-[11px] font-semibold tracking-[0.18em] uppercase">{copyLabel}</p>
        <h2 className="font-display text-[15px] font-bold tracking-[0.1em] uppercase">Fee Receipt</h2>
        <p className="text-[11px] tracking-wide">
          {issuedAt.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" })}
        </p>
      </div>

      {/* ── who and what ── */}
      <dl className="mt-3 grid grid-cols-2 gap-x-8 gap-y-1 border border-line-2 p-3 text-[12.5px]">
        <Row label="Receipt No" value={receiptNumber} bold />
        <Row label="Invoice No" value={snapshot.invoiceNumber ?? "—"} />
        <Row label="Student" value={snapshot.studentName ?? "—"} bold />
        <Row label="Admission No" value={snapshot.admissionNumber ?? "—"} />
        <Row label="Class" value={snapshot.className || "—"} />
        <Row label="Term" value={snapshot.term ?? "—"} />
      </dl>

      {/* ── itemised particulars: the anti-opacity stance, on paper ── */}
      <table className="mt-3 w-full border-collapse text-[12.5px]">
        <thead>
          <tr>
            <th className="w-10 border border-line-2 px-2 py-1.5 text-left font-semibold">#</th>
            <th className="border border-line-2 px-2 py-1.5 text-left font-semibold">Particulars</th>
            <th className="w-28 border border-line-2 px-2 py-1.5 text-right font-semibold">Amount</th>
            <th className="w-28 border border-line-2 px-2 py-1.5 text-right font-semibold">Concession</th>
          </tr>
        </thead>
        <tbody>
          {lines.length === 0 ? (
            <tr>
              <td className="border border-line-2 px-2 py-1.5">1</td>
              <td className="border border-line-2 px-2 py-1.5">School fee</td>
              <td className="border border-line-2 px-2 py-1.5 text-right tnum">
                {formatMoney(snapshot.invoiceAmount ?? paid)}
              </td>
              <td className="border border-line-2 px-2 py-1.5 text-right tnum">—</td>
            </tr>
          ) : (
            lines.map((l, i) => (
              <tr key={`${l.head}-${i}`}>
                <td className="border border-line-2 px-2 py-1.5 tnum">{i + 1}</td>
                <td className="border border-line-2 px-2 py-1.5">{l.head}</td>
                <td className="border border-line-2 px-2 py-1.5 text-right tnum">{formatMoney(l.amount)}</td>
                <td className="border border-line-2 px-2 py-1.5 text-right tnum">
                  {l.concession ? `− ${formatMoney(l.concession)}` : "—"}
                </td>
              </tr>
            ))
          )}

          {lateFee > 0 ? (
            <tr>
              <td className="border border-line-2 px-2 py-1.5 tnum">{lines.length + 1}</td>
              <td className="border border-line-2 px-2 py-1.5">Late fee</td>
              <td className="border border-line-2 px-2 py-1.5 text-right tnum">{formatMoney(lateFee)}</td>
              <td className="border border-line-2 px-2 py-1.5 text-right tnum">—</td>
            </tr>
          ) : null}
        </tbody>
        <tfoot>
          {concession > 0 ? (
            <>
              <tr>
                <td colSpan={2} className="border border-line-2 px-2 py-1.5 text-right">
                  Gross
                </td>
                <td colSpan={2} className="border border-line-2 px-2 py-1.5 text-right tnum">
                  {formatMoney(gross + lateFee)}
                </td>
              </tr>
              <tr>
                <td colSpan={2} className="border border-line-2 px-2 py-1.5 text-right">
                  Less concession
                </td>
                <td colSpan={2} className="border border-line-2 px-2 py-1.5 text-right tnum">
                  − {formatMoney(concession)}
                </td>
              </tr>
            </>
          ) : null}
          <tr>
            <td colSpan={2} className="border border-line-2 px-2 py-1.5 text-right font-semibold">
              Invoice total
            </td>
            <td colSpan={2} className="border border-line-2 px-2 py-1.5 text-right font-semibold tnum">
              {formatMoney(invoiceTotal)}
            </td>
          </tr>
          {previouslyPaid > 0 ? (
            <tr>
              <td colSpan={2} className="border border-line-2 px-2 py-1.5 text-right">
                Already paid earlier
              </td>
              <td colSpan={2} className="border border-line-2 px-2 py-1.5 text-right tnum">
                − {formatMoney(previouslyPaid)}
              </td>
            </tr>
          ) : null}
          <tr>
            <td colSpan={2} className="border border-line-2 px-2 py-2 text-right font-bold">
              Amount received now
            </td>
            <td colSpan={2} className="border border-line-2 px-2 py-2 text-right text-[14px] font-bold tnum">
              {formatMoney(paid)}
            </td>
          </tr>
          {balance > 0 ? (
            <tr>
              <td colSpan={2} className="border border-line-2 px-2 py-1.5 text-right font-semibold">
                Balance still due
              </td>
              <td colSpan={2} className="border border-line-2 px-2 py-1.5 text-right font-semibold tnum">
                {formatMoney(balance)}
              </td>
            </tr>
          ) : null}
        </tfoot>
      </table>

      <p className="mt-2 text-[12px]">
        <span className="font-semibold">In words:</span> {moneyInWords(paid)}
      </p>

      <dl className="mt-3 grid grid-cols-2 gap-x-8 gap-y-1 text-[12.5px]">
        <Row label="Paid by" value={humanMode(snapshot.mode)} />
        <Row label="Reference" value={snapshot.reference || "—"} />
        <Row
          label="Balance now"
          value={balance > 0 ? formatMoney(balance) : "Nil"}
          bold={balance > 0}
        />
        <Row label="Received by" value={snapshot.collectedByName ?? "—"} />
      </dl>

      {/* ── the honesty line: this is the whole positioning, printed ── */}
      <p className="mt-4 border border-line-2 bg-paper-2 px-3 py-2 text-center text-[11.5px] font-semibold print:bg-white">
        You paid exactly {formatMoney(paid)} — no convenience fee, no hidden charges.
      </p>

      <footer className="mt-8 flex items-end justify-between">
        <p className="max-w-[280px] text-[10.5px] leading-snug text-ink-3">
          This is a computer-generated receipt. Please retain it for your records. Fees once paid are
          not refundable except as per school policy.
        </p>
        <div className="text-center">
          <div className="mb-1 h-9 w-44 border-b border-ink" />
          <p className="text-[11px]">Cashier / Authorised Signatory</p>
        </div>
      </footer>
    </article>
  );
}

function Row({ label, value, bold }: { label: string; value: string; bold?: boolean }) {
  return (
    <div className="flex gap-2">
      <dt className="w-28 shrink-0 text-ink-3">{label}</dt>
      <dd className={bold ? "font-semibold" : ""}>{value}</dd>
    </div>
  );
}

function humanMode(mode?: string): string {
  if (!mode) return "—";
  const map: Record<string, string> = {
    CASH: "Cash",
    UPI: "UPI",
    CHEQUE: "Cheque",
    CARD: "Card",
    NETBANKING: "Net banking",
    DD: "Demand draft",
    NEFT: "NEFT / IMPS",
    ADJUSTMENT: "Adjustment",
  };
  return map[mode] ?? mode;
}
