"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check, Copy, KeyRound, Loader2, TriangleAlert } from "lucide-react";
import { Button, Card, CardHead } from "@/components/ui/primitives";
import { ASSIGNABLE_ROLES, validateStaffDetails } from "@/lib/core/staff-core";
import { createStaff, updateStaff } from "./people-actions";

export type StaffExisting = {
  staffId: string;
  employeeId: string;
  name: string;
  email: string;
  phone: string;
  designation: string;
  department: string;
  qualification: string;
  roles: string[];
  basicPayText: string;
  joiningIso: string;
  dobIso: string;
  gender: string;
  address: string;
  panNumber: string;
  bankAccountNo: string;
  bankIfsc: string;
};

const INPUT =
  "h-9.5 w-full rounded-md border border-line-2 bg-white px-2.5 text-[14px] outline-none focus:border-brand";

const ROLE_LABEL: Record<string, string> = {
  OWNER: "Owner / trustee",
  PRINCIPAL: "Principal",
  ADMIN: "Office",
  ACCOUNTANT: "Accounts",
  TEACHER: "Teacher",
  LIBRARIAN: "Librarian",
};

const ROLE_HINT: Record<string, string> = {
  OWNER: "Everything, including who else has access",
  PRINCIPAL: "Everything except the owner's own settings; can read any conversation",
  ADMIN: "Admissions, students, attendance, notices, certificates",
  ACCOUNTANT: "Fees, receipts, the day book and payroll",
  TEACHER: "Their own classes: attendance, marks, homework, their parents",
  LIBRARIAN: "The library only",
};

export function StaffForm({ existing }: { existing?: StaffExisting }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [issued, setIssued] = useState<{ password: string | null; employeeId: string; reused: boolean } | null>(null);
  const [copied, setCopied] = useState(false);

  const [form, setForm] = useState({
    name: existing?.name ?? "",
    email: existing?.email ?? "",
    phone: existing?.phone ?? "",
    employeeId: existing?.employeeId ?? "",
    designation: existing?.designation ?? "",
    department: existing?.department ?? "",
    qualification: existing?.qualification ?? "",
    roles: existing?.roles ?? (["TEACHER"] as string[]),
    basicPayText: existing?.basicPayText ?? "",
    joiningIso: existing?.joiningIso ?? "",
    dobIso: existing?.dobIso ?? "",
    gender: existing?.gender ?? "",
    address: existing?.address ?? "",
    panNumber: existing?.panNumber ?? "",
    bankAccountNo: existing?.bankAccountNo ?? "",
    bankIfsc: existing?.bankIfsc ?? "",
  });

  function set<K extends keyof typeof form>(k: K, v: (typeof form)[K]) {
    setForm((f) => ({ ...f, [k]: v }));
  }

  function toggleRole(role: string) {
    set("roles", form.roles.includes(role) ? form.roles.filter((r) => r !== role) : [...form.roles, role]);
  }

  // The same rules the server applies, read live — the warnings here (a salary that
  // looks annual, somebody who has not joined yet) are worth seeing before saving,
  // and a successful save navigates away.
  const live = validateStaffDetails({
    name: form.name,
    email: form.email,
    phone: form.phone,
    roles: form.roles,
    basicPaise: form.basicPayText.trim() === "" ? null : Math.round(Number(form.basicPayText.replace(/[₹,\s]/g, "")) * 100),
    joiningIso: form.joiningIso || null,
    dobIso: form.dobIso || null,
  });
  const warn = (field: string) =>
    live.messages.find((m) => m.field === field && m.level === "WARNING")?.message;

  function submit() {
    setError(null);
    start(async () => {
      if (existing) {
        const r = await updateStaff({ ...form, staffId: existing.staffId });
        if (r.error) {
          setError(r.error);
          return;
        }
        router.push(`/app/staff/${existing.staffId}`);
        router.refresh();
        return;
      }

      const r = await createStaff(form);
      if (r.error) {
        setError(r.error);
        return;
      }
      // Shown once. The password is stored only as a hash, so closing this without
      // writing it down leaves a reset as the only way back.
      setIssued({
        password: r.firstPassword ?? null,
        employeeId: r.employeeId ?? "",
        reused: Boolean(r.reusedLogin),
      });
    });
  }

  if (issued) {
    return (
      <Card className="mt-5">
        <CardHead
          title={`${form.name} can sign in`}
          hint={`Employee id ${issued.employeeId}. This is the only time the password is shown — it is stored as a hash, so nobody, including us, can read it back.`}
        />
        <div className="space-y-4 px-5 py-5">
          {issued.reused ? (
            <p className="rounded-md border border-line bg-paper-2/60 px-3.5 py-3 text-[13.5px] leading-relaxed text-ink-2">
              This person already had a Flanca login at another school, so their password is unchanged.
              They sign in with <span className="font-semibold">{form.email}</span> and the password they
              already use.
            </p>
          ) : (
            <>
              <div className="rounded-lg border border-brand/30 bg-brand-light/50 px-4 py-4">
                <p className="text-[12px] font-semibold tracking-wide text-ink-3 uppercase">First password</p>
                <p className="mt-1.5 font-mono text-[22px] font-semibold tracking-wide tabular-nums">
                  {issued.password}
                </p>
                <button
                  onClick={() => {
                    navigator.clipboard?.writeText(issued.password ?? "");
                    setCopied(true);
                  }}
                  className="mt-2 inline-flex items-center gap-1.5 text-[13px] font-semibold text-brand hover:underline"
                >
                  {copied ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}
                  {copied ? "Copied" : "Copy"}
                </button>
              </div>
              <p className="flex items-start gap-2 text-[13px] leading-relaxed text-ink-2">
                <TriangleAlert className="mt-0.5 size-4 shrink-0 text-marigold" />
                Write it down or read it to them now. Ask them to change it from their own screen after they
                sign in — until they do, whoever saw this can sign in as them.
              </p>
            </>
          )}
          <div className="flex items-center gap-3">
            <Button onClick={() => router.push("/app/staff")}>Done</Button>
            <button
              onClick={() => {
                setIssued(null);
                setForm({
                  name: "", email: "", phone: "", employeeId: "", designation: "", department: "",
                  qualification: "", roles: ["TEACHER"], basicPayText: "", joiningIso: "", dobIso: "",
                  gender: "", address: "", panNumber: "", bankAccountNo: "", bankIfsc: "",
                });
              }}
              className="text-[13.5px] font-semibold text-ink-2 hover:text-ink"
            >
              Add another
            </button>
          </div>
        </div>
      </Card>
    );
  }

  return (
    <Card className="mt-5">
      <CardHead
        title={existing ? "Correct this record" : "New member of staff"}
        hint={
          existing
            ? "The email is how this person signs in. Changing it changes their login."
            : "This creates their login too. Leave the employee id blank and the school's own numbering continues."
        }
      />

      <div className="space-y-5 px-5 py-5">
        {error ? (
          <p className="rounded-md border border-overdue/25 bg-overdue-light px-3 py-2 text-[13.5px] text-overdue">
            {error}
          </p>
        ) : null}

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <Field label="Name" required>
            <input value={form.name} onChange={(e) => set("name", e.target.value)} className={INPUT} placeholder="Priya Menon" />
          </Field>
          <Field label="Email — their login" required>
            <input
              value={form.email}
              onChange={(e) => set("email", e.target.value)}
              className={INPUT}
              placeholder="priya.menon@school.edu.in"
              inputMode="email"
            />
          </Field>
          <Field label="Mobile">
            <input value={form.phone} onChange={(e) => set("phone", e.target.value)} className={INPUT} inputMode="numeric" placeholder="98260 10001" />
            {warn("phone") ? <Hint text={warn("phone")!} /> : null}
          </Field>

          <Field label="Employee id">
            <input
              value={form.employeeId}
              onChange={(e) => set("employeeId", e.target.value)}
              className={INPUT}
              placeholder={existing ? "" : "left blank, we continue the series"}
              disabled={Boolean(existing)}
            />
          </Field>
          <Field label="Designation">
            <input value={form.designation} onChange={(e) => set("designation", e.target.value)} className={INPUT} placeholder="Senior Teacher" />
          </Field>
          <Field label="Department">
            <input value={form.department} onChange={(e) => set("department", e.target.value)} className={INPUT} placeholder="Science" />
          </Field>

          <Field label="Joining date">
            <input type="date" value={form.joiningIso} onChange={(e) => set("joiningIso", e.target.value)} className={INPUT} />
            {warn("joiningDate") ? <Hint text={warn("joiningDate")!} /> : null}
          </Field>
          <Field label="Date of birth">
            <input type="date" value={form.dobIso} onChange={(e) => set("dobIso", e.target.value)} className={INPUT} />
            {warn("dob") ? <Hint text={warn("dob")!} /> : null}
          </Field>
          <Field label="Basic pay, a month">
            <input
              value={form.basicPayText}
              onChange={(e) => set("basicPayText", e.target.value)}
              className={INPUT}
              inputMode="decimal"
              placeholder="42,000"
            />
            {warn("basicPay") ? <Hint text={warn("basicPay")!} /> : null}
          </Field>

          <Field label="Qualification">
            <input value={form.qualification} onChange={(e) => set("qualification", e.target.value)} className={INPUT} placeholder="M.Sc., B.Ed." />
          </Field>
          <Field label="Gender">
            <select value={form.gender} onChange={(e) => set("gender", e.target.value)} className={INPUT}>
              <option value="">Not recorded</option>
              <option value="FEMALE">Female</option>
              <option value="MALE">Male</option>
              <option value="OTHER">Other</option>
            </select>
          </Field>
          <Field label="Address">
            <input value={form.address} onChange={(e) => set("address", e.target.value)} className={INPUT} />
          </Field>

          <Field label="PAN">
            <input
              value={form.panNumber}
              onChange={(e) => set("panNumber", e.target.value.toUpperCase())}
              className={INPUT}
              placeholder="ABCDE1234F"
            />
          </Field>
          <Field label="Bank account no.">
            <input
              value={form.bankAccountNo}
              onChange={(e) => set("bankAccountNo", e.target.value)}
              className={INPUT}
              inputMode="numeric"
            />
          </Field>
          <Field label="IFSC">
            <input
              value={form.bankIfsc}
              onChange={(e) => set("bankIfsc", e.target.value.toUpperCase())}
              className={INPUT}
              placeholder="HDFC0001234"
            />
          </Field>
        </div>

        <div>
          <p className="text-[13px] font-semibold">What they can open</p>
          <p className="mt-0.5 text-[12px] text-ink-3">
            More than one is fine — a small school's principal is often the accountant too.
          </p>
          <div className="mt-2.5 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {ASSIGNABLE_ROLES.map((role) => (
              <label
                key={role}
                className={`flex cursor-pointer items-start gap-2.5 rounded-lg border px-3 py-2.5 transition ${
                  form.roles.includes(role)
                    ? "border-brand bg-brand-light/40"
                    : "border-line bg-white hover:border-line-2"
                }`}
              >
                <input
                  type="checkbox"
                  checked={form.roles.includes(role)}
                  onChange={() => toggleRole(role)}
                  className="mt-0.5 size-3.5 accent-[var(--color-brand)]"
                />
                <span>
                  <span className="block text-[13.5px] font-semibold">{ROLE_LABEL[role]}</span>
                  <span className="block text-[11.5px] leading-snug text-ink-3">{ROLE_HINT[role]}</span>
                </span>
              </label>
            ))}
          </div>
          {live.messages.find((m) => m.field === "roles") ? (
            <p className="mt-1.5 text-[12px] text-marigold">
              {live.messages.find((m) => m.field === "roles")!.message}
            </p>
          ) : null}
        </div>

        <div className="flex items-center gap-3 border-t border-line pt-4">
          <Button disabled={pending || !live.ok} onClick={submit}>
            {pending ? <Loader2 className="size-4 animate-spin" /> : existing ? <Check className="size-4" /> : <KeyRound className="size-4" />}
            {existing ? "Save changes" : "Add and create their login"}
          </Button>
          <button onClick={() => router.back()} className="text-[13.5px] font-semibold text-ink-2 hover:text-ink">
            Cancel
          </button>
        </div>
      </div>
    </Card>
  );
}

function Field({ label, required, children }: { label: string; required?: boolean; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-[13px] font-semibold">
        {label}
        {required ? <span className="ml-0.5 text-overdue">*</span> : null}
      </span>
      {children}
    </label>
  );
}

function Hint({ text }: { text: string }) {
  return <p className="mt-1 text-[12px] leading-snug text-marigold">{text}</p>;
}
