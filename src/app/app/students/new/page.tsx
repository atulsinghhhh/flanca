import Link from "next/link";
import { ArrowLeft, FileSpreadsheet } from "lucide-react";
import { requireRole, OFFICE } from "@/lib/session";
import { db } from "@/lib/db";
import { isoDay } from "@/lib/queries/when";
import { ButtonLink, PageHead } from "@/components/ui/primitives";
import { StudentForm } from "../student-form";

export const metadata = { title: "Add a student — Flanca" };

export default async function NewStudentPage() {
  const actor = await requireRole(...OFFICE);

  const classes = await db.class.findMany({
    where: { schoolId: actor.schoolId },
    orderBy: { sequenceOrder: "asc" },
    select: { id: true, name: true, sections: { orderBy: { name: "asc" }, select: { id: true, name: true } } },
  });

  return (
    <>
      <Link
        href="/app/students"
        className="mb-4 inline-flex items-center gap-1.5 text-[13px] font-semibold text-ink-3 hover:text-ink"
      >
        <ArrowLeft className="size-3.5" /> All students
      </Link>

      <PageHead
        eyebrow="Students"
        title="Add a student"
        sub="A walk-in admission, or the child the import could not read. Everything here can be corrected afterwards."
        actions={
          <ButtonLink href="/app/import" variant="secondary" size="sm">
            <FileSpreadsheet className="size-4" /> Import from Excel instead
          </ButtonLink>
        }
      />

      <StudentForm classes={classes} todayIso={isoDay()} />
    </>
  );
}
