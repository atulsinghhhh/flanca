"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Loader2, Save, UserPlus } from "lucide-react";
import { Button, Card, CardHead } from "@/components/ui/primitives";
import { validateStudentDetails } from "@/lib/core/student-core";
import { createStudent, updateStudent, type StudentInput } from "./actions";

type ClassOption = { id: string; name: string; sections: Array<{ id: string; name: string }> };

type Existing = StudentInput & { studentId: string; admissionNumber: string };

const CATEGORIES = ["GEN", "OBC", "SC", "ST", "EWS"];
const BLOOD = ["A+", "A-", "B+", "B-", "AB+", "AB-", "O+", "O-"];

/**
 * One form for admitting a child and for correcting one afterwards.
 *
 * Deliberately one component: an "add" form and an "edit" form that drift apart is
 * how a school ends up able to type something at admission that it can never fix.
 */
export function StudentForm({
  classes,
  existing,
  todayIso,
}: {
  classes: ClassOption[];
  existing?: Existing;
  todayIso: string;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [warnings, setWarnings] = useState<string[]>([]);

  const [form, setForm] = useState<StudentInput>({
    name: existing?.name ?? "",
    classId: existing?.classId ?? "",
    sectionId: existing?.sectionId ?? "",
    admissionNumber: "",
    rollNumber: existing?.rollNumber ?? null,
    dobIso: existing?.dobIso ?? "",
    gender: existing?.gender ?? "",
    fatherName: existing?.fatherName ?? "",
    motherName: existing?.motherName ?? "",
    guardianPhone: existing?.guardianPhone ?? "",
    guardianEmail: existing?.guardianEmail ?? "",
    address: existing?.address ?? "",
    category: existing?.category ?? "",
    bloodGroup: existing?.bloodGroup ?? "",
    admissionDateIso: existing?.admissionDateIso ?? todayIso,
  });

  const set = <K extends keyof StudentInput>(key: K, value: StudentInput[K]) =>
    setForm((f) => ({ ...f, [key]: value }));

  const sections = useMemo(
    () => classes.find((c) => c.id === form.classId)?.sections ?? [],
    [classes, form.classId],
  );

  // The same rule the server applies, read live: a warning that only arrives with the
  // server's answer is a warning nobody sees, because a successful save navigates
  // straight to the child's profile.
  const sectionWarning = validateStudentDetails({
    name: form.name,
    classId: form.classId,
    sectionId: form.sectionId,
    classHasSections: sections.length > 0,
  }).messages.find((m) => m.field === "sectionId" && m.level === "WARNING")?.message;

  function submit() {
    setError(null);
    setWarnings([]);
    start(async () => {
      const result = existing
        ? await updateStudent({ ...form, studentId: existing.studentId })
        : await createStudent(form);

      if ("error" in result && result.error) {
        setError(result.error);
        return;
      }
      const warned = ("messages" in result ? (result.messages ?? []) : []).filter((m) => m.level === "WARNING").map((m) => m.message);
      setWarnings(warned);

      if ("studentId" in result && result.studentId) {
        router.push(`/app/students/${result.studentId}`);
        router.refresh();
      }
    });
  }

  return (
    <Card className="mt-5">
      <CardHead
        title={existing ? "Correct this record" : "New student"}
        hint={
          existing
            ? `Admission number ${existing.admissionNumber} cannot be changed — it is printed on receipts and certificates already issued.`
            : "Leave the admission number blank and the school's own numbering continues from the roll."
        }
      />

      <div className="space-y-5 px-5 py-5">
        {error ? (
          <p className="rounded-md border border-overdue/25 bg-overdue-light px-3 py-2 text-[13.5px] text-overdue">
            {error}
          </p>
        ) : null}
        {warnings.length > 0 ? (
          <ul className="space-y-1 rounded-md border border-marigold/30 bg-marigold-light/60 px-3 py-2 text-[13px] text-marigold-ink-strong">
            {warnings.map((w) => (
              <li key={w}>{w}</li>
            ))}
          </ul>
        ) : null}

        <Group title="The child">
          <Field label="Full name" required className="sm:col-span-2">
            <input
              value={form.name}
              onChange={(e) => set("name", e.target.value)}
              placeholder="As it should appear on the certificate"
              className={INPUT}
              autoFocus
            />
          </Field>

          {existing ? null : (
            <Field label="Admission number" hint="optional">
              <input
                value={form.admissionNumber ?? ""}
                onChange={(e) => set("admissionNumber", e.target.value)}
                placeholder="Issued automatically"
                className={INPUT}
              />
            </Field>
          )}

          <Field label="Date of birth">
            <input type="date" value={form.dobIso ?? ""} max={todayIso} onChange={(e) => set("dobIso", e.target.value)} className={INPUT} />
          </Field>

          <Field label="Gender">
            <select value={form.gender ?? ""} onChange={(e) => set("gender", e.target.value)} className={INPUT}>
              <option value="">Not recorded</option>
              <option value="MALE">Boy</option>
              <option value="FEMALE">Girl</option>
              <option value="OTHER">Other</option>
            </select>
          </Field>

          <Field label="Blood group">
            <select value={form.bloodGroup ?? ""} onChange={(e) => set("bloodGroup", e.target.value)} className={INPUT}>
              <option value="">Not recorded</option>
              {BLOOD.map((b) => (
                <option key={b} value={b}>{b}</option>
              ))}
            </select>
          </Field>

          <Field label="Category" hint="UDISE+">
            <select value={form.category ?? ""} onChange={(e) => set("category", e.target.value)} className={INPUT}>
              <option value="">Not recorded</option>
              {CATEGORIES.map((c) => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
          </Field>
        </Group>

        <Group title="Where the child sits">
          <Field label="Class" required>
            <select
              value={form.classId}
              onChange={(e) => {
                set("classId", e.target.value);
                set("sectionId", "");
              }}
              className={INPUT}
            >
              <option value="">Choose a class…</option>
              {classes.map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          </Field>

          <Field label="Section">
            <select
              value={form.sectionId ?? ""}
              onChange={(e) => set("sectionId", e.target.value)}
              className={INPUT}
              disabled={sections.length === 0}
            >
              <option value="">{sections.length === 0 ? "Choose a class first" : "Not assigned yet"}</option>
              {sections.map((s) => (
                <option key={s.id} value={s.id}>{s.name}</option>
              ))}
            </select>
            {sectionWarning ? (
              <p className="mt-1.5 text-[12px] leading-snug text-marigold">{sectionWarning}</p>
            ) : null}
          </Field>

          <Field label="Roll number">
            <input
              inputMode="numeric"
              value={form.rollNumber ?? ""}
              onChange={(e) => {
                const digits = e.target.value.replace(/\D/g, "");
                set("rollNumber", digits === "" ? null : Number(digits));
              }}
              placeholder="Optional"
              className={INPUT}
            />
          </Field>

          <Field label="Date of admission">
            <input
              type="date"
              value={form.admissionDateIso ?? ""}
              max={todayIso}
              onChange={(e) => set("admissionDateIso", e.target.value)}
              className={INPUT}
            />
          </Field>
        </Group>

        <Group title="Parents">
          <Field label="Father's name">
            <input value={form.fatherName ?? ""} onChange={(e) => set("fatherName", e.target.value)} className={INPUT} />
          </Field>
          <Field label="Mother's name">
            <input value={form.motherName ?? ""} onChange={(e) => set("motherName", e.target.value)} className={INPUT} />
          </Field>
          <Field label="Mobile" hint="this is what reaches the parent">
            <input
              inputMode="tel"
              value={form.guardianPhone ?? ""}
              onChange={(e) => set("guardianPhone", e.target.value)}
              placeholder="10 digits"
              className={INPUT}
            />
          </Field>
          <Field label="Email">
            <input
              inputMode="email"
              value={form.guardianEmail ?? ""}
              onChange={(e) => set("guardianEmail", e.target.value)}
              className={INPUT}
            />
          </Field>
          <Field label="Address" className="sm:col-span-2">
            <input value={form.address ?? ""} onChange={(e) => set("address", e.target.value)} className={INPUT} />
          </Field>
        </Group>
      </div>

      <div className="flex flex-wrap items-center gap-3 border-t border-line px-5 py-4">
        <Button onClick={submit} disabled={pending || !form.name.trim() || !form.classId}>
          {pending ? (
            <Loader2 className="size-4 animate-spin" />
          ) : existing ? (
            <Save className="size-4" />
          ) : (
            <UserPlus className="size-4" />
          )}
          {existing ? "Save the correction" : "Admit this student"}
        </Button>
        <Link
          href={existing ? `/app/students/${existing.studentId}` : "/app/students"}
          className="text-[13.5px] font-semibold text-ink-2 hover:text-brand"
        >
          Cancel
        </Link>
        {!existing ? (
          <p className="text-[12.5px] text-ink-3">
            Admitting more than a handful? The Excel import is faster, and shows you every row first.
          </p>
        ) : null}
      </div>
    </Card>
  );
}

const INPUT =
  "h-10 w-full rounded-md border border-line-2 bg-white px-3 text-[14.5px] outline-none focus:border-brand";

function Group({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="eyebrow text-ink-3 mb-2.5">{title}</p>
      <div className="grid gap-4 sm:grid-cols-2">{children}</div>
    </div>
  );
}

function Field({
  label,
  hint,
  required,
  className,
  children,
}: {
  label: string;
  hint?: string;
  required?: boolean;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <label className={className}>
      <span className="mb-1.5 block text-[13px] font-semibold">
        {label}
        {required ? <span className="text-overdue"> *</span> : null}
        {hint ? <span className="ml-1.5 font-normal text-ink-3">{hint}</span> : null}
      </span>
      {children}
    </label>
  );
}
