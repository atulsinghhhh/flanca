import { db } from "@/lib/db";
import { isoDay } from "@/lib/queries/when";
import { apaarCoverage, daysToFreeze } from "@/lib/core/apaar-core";
import { summariseDues } from "@/lib/core/fees-core";

/** The one screen an owner opens daily. Every number here is real or absent. */
export async function getOverview(schoolId: string, today = new Date()) {
  const dayStart = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate()));

  const [
    studentCount,
    sectionCount,
    staffCount,
    invoices,
    todayAttendance,
    staffAttendanceRows,
    apaarStudents,
    consentPending,
    newEnquiries,
    openApplications,
    upcomingEvents,
    recentPayments,
    publishedTerms,
    pendingTerms,
    unreturnedBooks,
    todaysTimetable,
  ] = await Promise.all([
    db.student.count({ where: { schoolId, status: "ACTIVE" } }),
    db.section.count({ where: { schoolId } }),
    db.staff.count({ where: { schoolId, isActive: true } }),
    db.feeInvoice.findMany({
      where: { schoolId, status: { not: "CANCELLED" } },
      select: { amount: true, paidAmount: true, status: true, dueDate: true, studentId: true },
    }),
    db.attendance.groupBy({
      by: ["status"],
      where: { schoolId, date: dayStart, studentId: { not: null } },
      _count: true,
    }),
    db.attendance.findMany({
      where: { schoolId, date: dayStart, staffId: { not: null } },
      select: { staffId: true, status: true },
    }),
    db.student.findMany({
      where: { schoolId, status: "ACTIVE" },
      select: { id: true, name: true, apaarId: true, apaarStatus: true, aadhaarName: true },
    }),
    db.consentRecord.count({ where: { schoolId, state: "PENDING" } }),
    db.enquiry.count({ where: { schoolId, status: { in: ["NEW", "CONTACTED"] } } }),
    db.application.count({
      where: { schoolId, status: { in: ["SUBMITTED", "UNDER_REVIEW", "DOCUMENTS_PENDING", "SHORTLISTED"] } },
    }),
    db.calendarEvent.findMany({
      where: { schoolId, startDate: { gte: dayStart } },
      orderBy: { startDate: "asc" },
      take: 5,
    }),
    db.feePayment.findMany({
      where: { schoolId, paidAt: { gte: new Date(dayStart.getTime() - 13 * 86_400_000) }, reversedAt: null },
      select: { amount: true, paidAt: true, mode: true },
    }),
    db.examTerm.count({ where: { schoolId, isPublished: true } }),
    db.examTerm.count({ where: { schoolId, isPublished: false } }),
    db.bookIssue.count({ where: { schoolId, returnedOn: null } }),
    db.timetableEntry.findMany({
      where: { schoolId, dayOfWeek: ((dayStart.getUTCDay() + 6) % 7) + 1 },
      select: { period: true, startTime: true, endTime: true, sectionId: true, staffId: true },
    }),
  ]);

  // ── money
  const billed = invoices.reduce((a, i) => a + i.amount, 0);
  const collected = invoices.reduce((a, i) => a + i.paidAmount, 0);
  const dues = summariseDues(invoices, today);
  const defaulterIds = new Set(
    invoices
      .filter((i) => i.amount - i.paidAmount > 0 && i.dueDate < today)
      .map((i) => i.studentId),
  );

  // ── attendance today
  const attendanceByStatus = Object.fromEntries(todayAttendance.map((r) => [r.status, r._count]));
  const markedToday = todayAttendance.reduce((a, r) => a + r._count, 0);
  const presentToday = (attendanceByStatus.PRESENT ?? 0) + (attendanceByStatus.LATE ?? 0);

  const sectionsMarked = await db.attendance.findMany({
    where: { schoolId, date: dayStart, studentId: { not: null } },
    select: { sectionId: true },
    distinct: ["sectionId"],
  });

  // ── 14-day collection trend, oldest first
  const trend: Array<{ date: string; amount: number }> = [];
  for (let i = 13; i >= 0; i--) {
    const d = new Date(dayStart.getTime() - i * 86_400_000);
    const key = isoDay(d);
    const amount = recentPayments
      .filter((p) => isoDay(p.paidAt) === key)
      .reduce((a, p) => a + p.amount, 0);
    trend.push({ date: key, amount });
  }

  // ── today's timetable: what period is running right now, and is anybody missing
  const staffPresentToday = staffAttendanceRows.filter(
    (r) => r.status === "PRESENT" || r.status === "LATE",
  ).length;
  const presentStaffIds = new Set(
    staffAttendanceRows.filter((r) => r.status === "PRESENT" || r.status === "LATE").map((r) => r.staffId),
  );
  const staffAttendanceTaken = staffAttendanceRows.length > 0;

  const nowStr = `${String(today.getHours()).padStart(2, "0")}:${String(today.getMinutes()).padStart(2, "0")}`;
  const inSession = todaysTimetable.filter(
    (e) => e.startTime && e.endTime && e.startTime <= nowStr && nowStr < e.endTime,
  );
  const currentPeriod = inSession[0]?.period ?? null;
  const sectionsInSession = new Set(inSession.map((e) => e.sectionId).filter(Boolean)).size;
  const uncoveredNow = staffAttendanceTaken
    ? inSession.filter((e) => e.staffId && !presentStaffIds.has(e.staffId)).length
    : 0;

  const apaar = apaarCoverage(
    apaarStudents.map((s) => ({
      id: s.id,
      name: s.name,
      apaarId: s.apaarId,
      apaarStatus: s.apaarStatus,
      aadhaarName: s.aadhaarName,
      consentGranted: s.apaarStatus !== "CONSENT_PENDING" && s.apaarStatus !== "CONSENT_REFUSED",
      consentRefused: s.apaarStatus === "CONSENT_REFUSED",
    })),
  );

  return {
    studentCount,
    sectionCount,
    staffCount,
    staffPresentToday,
    money: {
      billed,
      collected,
      collectedBp: billed > 0 ? Math.round((collected / billed) * 10000) : 0,
      outstanding: dues.total,
      overdue: dues.overdue,
      buckets: dues.buckets,
      defaulters: defaulterIds.size,
      trend,
    },
    attendance: {
      marked: markedToday,
      present: presentToday,
      absent: attendanceByStatus.ABSENT ?? 0,
      late: attendanceByStatus.LATE ?? 0,
      leave: attendanceByStatus.LEAVE ?? 0,
      sectionsMarked: sectionsMarked.filter((s) => s.sectionId).length,
      percentBp: markedToday > 0 ? Math.round((presentToday / markedToday) * 10000) : 0,
    },
    compliance: {
      apaar,
      daysToFreeze: daysToFreeze(today),
      consentPending,
    },
    admissions: { newEnquiries, openApplications },
    academics: { publishedTerms, pendingTerms },
    library: { unreturnedBooks },
    timetableToday: { currentPeriod, sectionsInSession, uncoveredNow, staffAttendanceTaken },
    upcomingEvents,
  };
}
