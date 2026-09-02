import Link from "next/link";
import { AlertTriangle, BadgeCheck, FileSpreadsheet, Search, UserPlus } from "lucide-react";
import type { StudentStatus } from "@prisma/client";
import { requireActor } from "@/lib/session";
import { getClassOptions, listStudents, PAGE_SIZE } from "@/lib/queries/students";
import { formatMoney } from "@/lib/core/money";
import { nextAction } from "@/lib/core/apaar-core";
import { Badge, ButtonLink, Card, Empty, PageHead } from "@/components/ui/primitives";

export const metadata = { title: "Students — Flanca" };

type Search = {
  q?: string;
  classId?: string;
  sectionId?: string;
  status?: string;
  apaar?: string;
  dues?: string;
  page?: string;
};

const STATUS_TABS: Array<{ value: StudentStatus; label: string }> = [
  { value: "ACTIVE", label: "On roll" },
  { value: "ALUMNI", label: "Alumni" },
  { value: "TRANSFERRED", label: "Transferred" },
  { value: "DROPPED", label: "Left" },
];

export default async function StudentsPage({
  searchParams,
}: {
  searchParams: Promise<Search>;
}) {
  const actor = await requireActor();
  const sp = await searchParams;

  const status = (STATUS_TABS.find((t) => t.value === sp.status)?.value ?? "ACTIVE") as StudentStatus;
  const [classes, result] = await Promise.all([
    getClassOptions(actor.schoolId),
    listStudents(actor.schoolId, {
      q: sp.q?.trim() || undefined,
      classId: sp.classId || undefined,
      sectionId: sp.sectionId || undefined,
      status,
      apaar: sp.apaar === "issued" || sp.apaar === "blocking" ? sp.apaar : undefined,
      dues: sp.dues === "overdue" || sp.dues === "clear" ? sp.dues : undefined,
      page: sp.page ? Number(sp.page) : 1,
    }),
  ]);

  const sections = classes.find((c) => c.id === sp.classId)?.sections ?? [];
  const keep = (extra: Record<string, string | undefined>) => {
    const params = new URLSearchParams();
    const merged = { ...sp, ...extra };
    for (const [key, value] of Object.entries(merged)) {
      if (value) params.set(key, String(value));
    }
    return `/app/students?${params.toString()}`;
  };

  return (
    <>
      <PageHead
        eyebrow="Students"
        title={status === "ACTIVE" ? "Students on roll" : STATUS_TABS.find((t) => t.value === status)!.label}
        sub={`${result.total} student${result.total === 1 ? "" : "s"}${sp.q ? ` matching “${sp.q}”` : ""}`}
        actions={
          <>
            <ButtonLink href="/app/import" variant="secondary" size="sm">
              <FileSpreadsheet className="size-4" /> Import from Excel
            </ButtonLink>
            <ButtonLink href="/app/students/new" size="sm">
              <UserPlus className="size-4" /> Add student
            </ButtonLink>
          </>
        }
      />

      {/* ── filters: one row, GET form, no client JS ── */}
      <Card className="mb-4 px-4 py-3">
        <form method="get" className="flex flex-wrap items-end gap-2.5">
          <input type="hidden" name="status" value={status} />

          <div className="min-w-[220px] flex-1">
            <label htmlFor="q" className="eyebrow text-ink-3 mb-1 block">
              Search
            </label>
            <div className="relative">
              <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-ink-3" />
              <input
                id="q"
                name="q"
                defaultValue={sp.q ?? ""}
                placeholder="Name, admission no, mobile, APAAR"
                className="h-9.5 w-full rounded-md border border-line-2 bg-white pr-3 pl-8.5 text-[14px] outline-none focus:border-brand"
              />
            </div>
          </div>

          <Select label="Class" name="classId" defaultValue={sp.classId} placeholder="All classes"
            options={classes.map((c) => ({ value: c.id, label: c.name }))} />

          {sections.length > 0 ? (
            <Select label="Section" name="sectionId" defaultValue={sp.sectionId} placeholder="All"
              options={sections.map((s) => ({ value: s.id, label: s.name }))} />
          ) : null}

          <Select label="Fees" name="dues" defaultValue={sp.dues} placeholder="Any"
            options={[{ value: "overdue", label: "Has overdue" }, { value: "clear", label: "Fully paid" }]} />

          <Select label="APAAR" name="apaar" defaultValue={sp.apaar} placeholder="Any"
            options={[{ value: "blocking", label: "Missing ID" }, { value: "issued", label: "ID issued" }]} />

          <button
            type="submit"
            className="h-9.5 rounded-md bg-brand px-4 text-[14px] font-semibold text-white hover:bg-brand-dark"
          >
            Apply
          </button>
          {sp.q || sp.classId || sp.dues || sp.apaar ? (
            <Link href={`/app/students?status=${status}`} className="h-9.5 px-2 pt-2 text-[13px] font-semibold text-ink-3 hover:text-ink">
              Clear
            </Link>
          ) : null}
        </form>
      </Card>

      {/* ── status tabs ── */}
      <div className="mb-4 flex flex-wrap gap-1.5">
        {STATUS_TABS.map((tab) => (
          <Link
            key={tab.value}
            href={keep({ status: tab.value, page: undefined })}
            className={
              tab.value === status
                ? "rounded-full bg-brand-light px-3 py-1 text-[13px] font-semibold text-brand-ink"
                : "rounded-full px-3 py-1 text-[13px] font-medium text-ink-3 hover:bg-paper-2 hover:text-ink"
            }
          >
            {tab.label}
          </Link>
        ))}
      </div>

      <Card className="overflow-hidden">
        {result.rows.length === 0 ? (
          <Empty
            title="No students match this filter"
            hint="Try clearing the search, or import your existing register from Excel."
            action={
              <ButtonLink href="/app/import" variant="secondary" size="sm">
                <FileSpreadsheet className="size-4" /> Import from Excel
              </ButtonLink>
            }
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="ruled w-full min-w-[880px]">
              <thead>
                <tr>
                  <th>Adm. no</th>
                  <th>Student</th>
                  <th>Class</th>
                  <th>Roll</th>
                  <th>Parent</th>
                  <th>Mobile</th>
                  <th className="num">Dues</th>
                  <th>APAAR</th>
                </tr>
              </thead>
              <tbody>
                {result.rows.map((s) => (
                  <tr key={s.id} className="hover:bg-brand-light/35">
                    <td data-label="Adm. no" className="font-mono text-[12.5px] whitespace-nowrap text-ink-2">
                      {s.admissionNumber}
                    </td>
                    <td data-title>
                      <Link
                        href={`/app/students/${s.id}`}
                        className="font-medium hover:text-brand hover:underline"
                      >
                        {s.name}
                      </Link>
                    </td>
                    <td data-label="Class" className="whitespace-nowrap text-ink-2">
                      {s.class?.name ?? "—"}
                      {s.section ? (
                        ` ${s.section.name}`
                      ) : s.status === "ACTIVE" ? (
                        // Attendance is marked per section, so a child in none of them is on
                        // the roll and on no register. Saying "—" hides that; naming it does not.
                        <span
                          className="ml-1.5 text-[11.5px] font-semibold text-marigold"
                          title="Not in a section, so this child will not appear on any attendance register."
                        >
                          no section
                        </span>
                      ) : null}
                    </td>
                    <td data-label="Roll" className="num text-ink-2">{s.rollNumber ?? "—"}</td>
                    <td data-label="Parent" className="text-ink-2">{s.fatherName ?? "—"}</td>
                    <td data-label="Mobile" className="font-mono text-[12.5px] whitespace-nowrap text-ink-2">
                      {s.guardianPhone ?? "—"}
                    </td>
                    <td data-label="Dues" className="num whitespace-nowrap">
                      {s.outstanding === 0 ? (
                        <span className="text-ink-3">—</span>
                      ) : (
                        <span className={s.overdue ? "font-semibold text-overdue" : "font-medium"}>
                          {formatMoney(s.outstanding)}
                        </span>
                      )}
                    </td>
                    <td data-label="APAAR" className="whitespace-nowrap">
                      {s.apaarState === "ISSUED" ? (
                        <span className="inline-flex items-center gap-1 text-[12.5px] text-good">
                          <BadgeCheck className="size-3.5" /> Issued
                        </span>
                      ) : (
                        <span
                          title={nextAction(s.apaarState)}
                          className="inline-flex items-center gap-1 text-[12.5px] text-marigold-ink"
                        >
                          <AlertTriangle className="size-3.5" />
                          {s.apaarState === "MISMATCH"
                            ? "Name mismatch"
                            : s.apaarState === "CONSENT_REFUSED"
                              ? "Refused"
                              : s.apaarState === "SUBMITTED"
                                ? "Submitted"
                                : "Consent due"}
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {result.pageCount > 1 ? (
          <div className="flex items-center justify-between border-t border-line px-5 py-3">
            <p className="text-[12.5px] text-ink-3">
              Showing {(result.page - 1) * PAGE_SIZE + 1}–
              {Math.min(result.page * PAGE_SIZE, result.total)} of {result.total}
            </p>
            <div className="flex items-center gap-1.5">
              {result.page > 1 ? (
                <Link
                  href={keep({ page: String(result.page - 1) })}
                  className="rounded-md border border-line-2 bg-white px-3 py-1.5 text-[13px] font-semibold hover:bg-paper-2"
                >
                  Previous
                </Link>
              ) : null}
              <span className="px-2 text-[13px] text-ink-3">
                Page {result.page} of {result.pageCount}
              </span>
              {result.page < result.pageCount ? (
                <Link
                  href={keep({ page: String(result.page + 1) })}
                  className="rounded-md border border-line-2 bg-white px-3 py-1.5 text-[13px] font-semibold hover:bg-paper-2"
                >
                  Next
                </Link>
              ) : null}
            </div>
          </div>
        ) : null}
      </Card>
    </>
  );
}

function Select({
  label,
  name,
  defaultValue,
  placeholder,
  options,
}: {
  label: string;
  name: string;
  defaultValue?: string;
  placeholder: string;
  options: Array<{ value: string; label: string }>;
}) {
  return (
    <div>
      <label htmlFor={name} className="eyebrow text-ink-3 mb-1 block">
        {label}
      </label>
      <select
        id={name}
        name={name}
        defaultValue={defaultValue ?? ""}
        className="h-9.5 rounded-md border border-line-2 bg-white px-2.5 text-[14px] outline-none focus:border-brand"
      >
        <option value="">{placeholder}</option>
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </div>
  );
}
