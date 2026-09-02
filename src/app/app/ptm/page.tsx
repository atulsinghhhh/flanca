import { db } from "@/lib/db";
import { requireActor } from "@/lib/session";
import { getChatPerson } from "@/lib/queries/chat";
import { schoolToday } from "@/lib/queries/when";
import { Card, Empty, PageHead } from "@/components/ui/primitives";
import { TeacherPtmView, type PtmSectionOption, type PtmSlotRow } from "./teacher-view";
import { ParentPtmView, type PtmChild } from "./parent-view";

export const metadata = { title: "Parent-teacher meetings — Flanca" };

export default async function PtmPage() {
  const actor = await requireActor();
  const today = schoolToday();

  const person = await getChatPerson(actor.schoolId, actor.id);
  const isOffice = Boolean(person?.roles.some((r) => ["OWNER", "PRINCIPAL", "ADMIN"].includes(r)));
  const canOfferAny = Boolean(person && (isOffice || person.roles.includes("TEACHER")));

  if (canOfferAny && person) {
    const reachable = isOffice ? null : [...new Set([...person.classTeacherOfSectionIds, ...person.teachesSectionIds])];

    const sections = await db.section.findMany({
      where: {
        schoolId: actor.schoolId,
        ...(reachable ? { id: { in: reachable } } : {}),
      },
      orderBy: [{ class: { sequenceOrder: "asc" } }, { name: "asc" }],
      select: { id: true, name: true, class: { select: { name: true } } },
    });

    const sectionIds = sections.map((s) => s.id);
    const slots =
      sectionIds.length > 0
        ? await db.pTMSlot.findMany({
            where: { schoolId: actor.schoolId, sectionId: { in: sectionIds }, date: { gte: today } },
            orderBy: [{ date: "asc" }, { startMinute: "asc" }],
            include: {
              section: { select: { id: true, name: true, class: { select: { name: true } } } },
              student: { select: { id: true, name: true } },
              bookedBy: { select: { name: true } },
            },
          })
        : [];

    const sectionOptions: PtmSectionOption[] = sections.map((s) => ({
      sectionId: s.id,
      label: `${s.class?.name ?? ""} ${s.name}`.trim(),
    }));

    const slotRows: PtmSlotRow[] = slots.map((s) => ({
      id: s.id,
      dateIso: s.date.toISOString().slice(0, 10),
      startMinute: s.startMinute,
      endMinute: s.endMinute,
      sectionLabel: `${s.section.class?.name ?? ""} ${s.section.name}`.trim(),
      booked: Boolean(s.bookedAt),
      studentName: s.student?.name ?? null,
      bookedByName: s.bookedBy?.name ?? null,
      note: s.note,
    }));

    return (
      <>
        <PageHead
          eyebrow="Connect"
          title="Parent-teacher meetings"
          sub="Open slots for a section, and parents book the one that suits them."
        />
        <TeacherPtmView sections={sectionOptions} todayIso={today.toISOString().slice(0, 10)} slots={slotRows} />
      </>
    );
  }

  const links = await db.parentLink.findMany({
    where: { schoolId: actor.schoolId, userId: actor.id },
    select: {
      student: {
        select: {
          id: true,
          name: true,
          sectionId: true,
          section: {
            select: {
              id: true,
              name: true,
              class: { select: { name: true } },
              classTeacher: { select: { name: true } },
            },
          },
        },
      },
    },
  });

  const children = links.map((l) => l.student).filter((s) => s.sectionId);
  const sectionIds = [...new Set(children.map((c) => c.sectionId as string))];

  const slots =
    sectionIds.length > 0
      ? await db.pTMSlot.findMany({
          where: { schoolId: actor.schoolId, sectionId: { in: sectionIds }, date: { gte: today } },
          orderBy: [{ date: "asc" }, { startMinute: "asc" }],
          include: { staff: { include: { user: { select: { name: true } } } }, student: { select: { id: true, name: true } } },
        })
      : [];

  const ptmChildren: PtmChild[] = children.map((c) => ({
    studentId: c.id,
    name: c.name,
    sectionId: c.sectionId as string,
    sectionLabel: `${c.section?.class?.name ?? ""} ${c.section?.name ?? ""}`.trim(),
    classTeacherName: c.section?.classTeacher?.name ?? null,
    slots: slots
      .filter((s) => s.sectionId === c.sectionId)
      .map((s) => ({
        id: s.id,
        dateIso: s.date.toISOString().slice(0, 10),
        startMinute: s.startMinute,
        endMinute: s.endMinute,
        teacherName: s.staff.user.name,
        booked: Boolean(s.bookedAt),
        bookedForThisChild: s.studentId === c.id,
        bookedStudentName: s.studentId && s.studentId !== c.id ? (s.student?.name ?? null) : null,
        note: s.note,
      })),
  }));

  return (
    <>
      <PageHead eyebrow="Connect" title="Parent-teacher meetings" sub="Book a time with your child's class teacher." />
      {ptmChildren.length === 0 ? (
        <Card>
          <Empty title="Nothing here for you yet." hint="This is for teachers, the office, and parents." />
        </Card>
      ) : (
        <ParentPtmView children={ptmChildren} />
      )}
    </>
  );
}
