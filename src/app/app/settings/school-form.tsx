"use client";

import { useActionState } from "react";
import { Check, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/primitives";
import { updateSchool } from "./actions";

type School = {
  name: string;
  address: string | null;
  city: string | null;
  state: string | null;
  phone: string | null;
  email: string | null;
  principalName: string | null;
  udiseCode: string | null;
  affiliationNo: string | null;
  upiId: string | null;
  upiPayeeName: string | null;
  bankName: string | null;
  bankAccountNo: string | null;
  bankIfsc: string | null;
};

export function SchoolForm({ school }: { school: School }) {
  const [state, action, pending] = useActionState(updateSchool, null);

  return (
    <form action={action}>
      <div className="space-y-6 px-5 py-5">
        <section>
          <p className="eyebrow text-ink-3 mb-3">Identity — printed on every receipt and certificate</p>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="School name" name="name" defaultValue={school.name} required />
            <Field label="Principal" name="principalName" defaultValue={school.principalName} />
            <div className="sm:col-span-2">
              <Field label="Address" name="address" defaultValue={school.address} />
            </div>
            <Field label="City" name="city" defaultValue={school.city} />
            <Field label="State" name="state" defaultValue={school.state} />
            <Field label="Phone" name="phone" defaultValue={school.phone} />
            <Field label="Email" name="email" type="email" defaultValue={school.email} />
          </div>
        </section>

        <section className="border-t border-line pt-5">
          <p className="eyebrow text-ink-3 mb-3">Recognition — shown on the public page and UDISE exports</p>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="CBSE affiliation number" name="affiliationNo" defaultValue={school.affiliationNo} />
            <Field label="UDISE code" name="udiseCode" defaultValue={school.udiseCode} />
          </div>
        </section>

        <section className="border-t border-line pt-5">
          <p className="eyebrow text-ink-3 mb-3">Money — where a parent's fee actually lands</p>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field
              label="UPI ID"
              name="upiId"
              defaultValue={school.upiId}
              hint="Paid direct to the school: no aggregator, no convenience fee"
              mono
            />
            <Field label="UPI payee name" name="upiPayeeName" defaultValue={school.upiPayeeName} />
            <Field label="Bank" name="bankName" defaultValue={school.bankName} />
            <Field label="Account number" name="bankAccountNo" defaultValue={school.bankAccountNo} mono />
            <Field label="IFSC" name="bankIfsc" defaultValue={school.bankIfsc} mono />
          </div>
        </section>
      </div>

      <div className="flex flex-wrap items-center gap-3 border-t border-line bg-paper-2/50 px-5 py-3.5">
        <Button type="submit" disabled={pending}>
          {pending ? <Loader2 className="size-4 animate-spin" /> : <Check className="size-4" />}
          Save school details
        </Button>
        {state?.ok ? <span className="text-[13px] text-good">Saved.</span> : null}
        {state?.error ? <span className="text-[13px] text-overdue">{state.error}</span> : null}
      </div>
    </form>
  );
}

function Field({
  label,
  name,
  defaultValue,
  required,
  type = "text",
  hint,
  mono,
}: {
  label: string;
  name: string;
  defaultValue?: string | null;
  required?: boolean;
  type?: string;
  hint?: string;
  mono?: boolean;
}) {
  return (
    <div>
      <label htmlFor={name} className="mb-1.5 block text-[13px] font-semibold">
        {label}
      </label>
      <input
        id={name}
        name={name}
        type={type}
        required={required}
        defaultValue={defaultValue ?? ""}
        className={`h-10 w-full rounded-md border border-line-2 bg-white px-2.5 outline-none focus:border-brand ${
          mono ? "font-mono text-[13px]" : "text-[14px]"
        }`}
      />
      {hint ? <p className="mt-1 text-[11.5px] text-ink-3">{hint}</p> : null}
    </div>
  );
}
