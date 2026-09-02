import { db } from "@/lib/db";
import { splitEvenly } from "@/lib/core/fees-core";

/**
 * Everything the school's own public page shows.
 *
 * Nothing here identifies a student. A public page must be safe to hand to a
 * stranger, so it carries the school's own facts, its published notices, its
 * public calendar dates — and its fee structure, which is the one thing no
 * Indian school website publishes and the reason a parent trusts this page.
 */
export async function getPublicSchool(slug: string) {
  const school = await db.school.findUnique({
    where: { slug },
    select: {
      id: true,
      name: true,
      slug: true,
      board: true,
      city: true,
      state: true,
      address: true,
      phone: true,
      email: true,
      website: true,
      principalName: true,
      udiseCode: true,
      affiliationNo: true,
      createdAt: true,
    },
  });
  if (!school) return null;

  const [year, classes, structures, heads, circulars, events, studentCount, staffCount] =
    await Promise.all([
      db.academicYear.findFirst({ where: { schoolId: school.id, isCurrent: true } }),
      db.class.findMany({
        where: { schoolId: school.id },
        orderBy: { sequenceOrder: "asc" },
        select: { id: true, name: true, sequenceOrder: true },
      }),
      db.feeStructure.findMany({
        where: { schoolId: school.id, isActive: true },
        include: { items: { include: { feeHead: true } }, installments: true, class: true },
      }),
      db.feeHead.findMany({ where: { schoolId: school.id }, orderBy: { sequenceOrder: "asc" } }),
      db.circular.findMany({
        where: { schoolId: school.id, isPublic: true, publishedAt: { not: null } },
        orderBy: { publishedAt: "desc" },
        take: 4,
      }),
      db.calendarEvent.findMany({
        where: { schoolId: school.id, isPublic: true, startDate: { gte: new Date() } },
        orderBy: { startDate: "asc" },
        take: 6,
      }),
      db.student.count({ where: { schoolId: school.id, status: "ACTIVE" } }),
      db.staff.count({ where: { schoolId: school.id, isActive: true } }),
    ]);

  const fees = structures
    .filter((s) => s.class)
    .map((s) => {
      const annual = s.items.reduce((a, i) => a + i.amount, 0);
      const terms = s.installments.length || 1;
      return {
        className: s.class!.name,
        sequenceOrder: s.class!.sequenceOrder,
        annual,
        perTerm: splitEvenly(annual, terms)[0] ?? annual,
        terms,
        byHead: Object.fromEntries(s.items.map((i) => [i.feeHead.name, i.amount])),
      };
    })
    .sort((a, b) => a.sequenceOrder - b.sequenceOrder);

  return {
    school,
    year,
    classes,
    fees,
    heads: heads.map((h) => h.name),
    circulars,
    events,
    stats: {
      students: studentCount,
      staff: staffCount,
      classRange:
        classes.length > 0 ? `${classes[0].name} to ${classes[classes.length - 1].name}` : "—",
    },
  };
}

/** Look up one application by its number and the phone that submitted it. */
export async function trackApplication(slug: string, applicationNo: string, phone: string) {
  const school = await db.school.findUnique({ where: { slug }, select: { id: true, name: true } });
  if (!school) return null;

  const digits = phone.replace(/\D/g, "").slice(-10);
  if (digits.length !== 10) return null;

  const application = await db.application.findFirst({
    where: {
      schoolId: school.id,
      applicationNo: applicationNo.trim(),
      phone: { contains: digits },
    },
    select: {
      applicationNo: true,
      studentName: true,
      classSought: true,
      status: true,
      documentsNote: true,
      reviewNote: true,
      submittedAt: true,
      updatedAt: true,
    },
  });

  return application ? { school, application } : { school, application: null };
}
