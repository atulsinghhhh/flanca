import { db } from "@/lib/db";
import { dayStartOf } from "@/lib/queries/attendance";
import { summariseAttendance, eligibilityCheck } from "@/lib/core/attendance-core";
import { outstandingOf, summariseDues } from "@/lib/core/fees-core";
import { getUpcomingExams } from "@/lib/queries/exams";

/**
 * A teacher's day: the sections they must mark, the marks still to enter, and
 * today's periods. Nothing about fees, nothing about the whole school — a
 * teacher opening this should see only what is theirs to do.
 */
export async function getTeacherHome(schoolId: string, userId: string, today = new Date()) {
  const day = dayStartOf(today);
  const dayOfWeek = ((day.getUTCDay() + 6) % 7) + 1; // Monday = 1

  const staff = await db.staff.findFirst({
    where: { schoolId, userId },
    select: { id: true, employeeId: true, designation: true },
  });

  const [sections, timetable, marksPending, homework, notifications, booksOut, examDutyToday] = await Promise.all([
    db.section.findMany({
      where: { schoolId, classTeacherId: userId },
      include: {
        class: { select: { name: true } },
        _count: { select: { students: { where: { status: "ACTIVE" } } } },
      },
    }),
    staff
      ? db.timetableEntry.findMany({
          where: { schoolId, staffId: staff.id, dayOfWeek },
          orderBy: { period: "asc" },
          include: {
            class: { select: { name: true } },
            section: { select: { name: true } },
            subject: { select: { name: true } },
          },
        })
      : [],
    staff
      ? db.exam.findMany({
          where: {
            schoolId,
            examTerm: { isPublished: false },
            subject: { staffSubjects: { some: { staffId: staff.id } } },
          },
          include: {
            subject: { select: { name: true } },
            class: { select: { name: true } },
            examTerm: { select: { name: true } },
            _count: { select: { results: true } },
          },
          take: 12,
        })
      : [],
    staff
      ? db.homework.findMany({
          where: { schoolId, staffId: staff.id, dueOn: { gte: day } },
          orderBy: { dueOn: "asc" },
          take: 6,
          include: { class: { select: { name: true } }, section: { select: { name: true } } },
        })
      : [],
    db.notification.findMany({
      where: { schoolId, userId, readAt: null },
      orderBy: { createdAt: "desc" },
      take: 5,
    }),
    staff
      ? db.bookIssue.findMany({
          where: { schoolId, staffId: staff.id, returnedOn: null },
          include: { book: { select: { title: true } } },
        })
      : [],
    staff
      ? db.examDuty.findMany({
          where: { schoolId, staffId: staff.id, exam: { examDate: day } },
          include: {
            exam: {
              select: {
                startTime: true, roomNo: true,
                subject: { select: { name: true } },
                class: { select: { name: true } },
              },
            },
          },
        })
      : [],
  ]);

  // Which of my sections are still unmarked today?
  const marked = await db.attendance.findMany({
    where: {
      schoolId,
      date: day,
      sectionId: { in: sections.map((s) => s.id) },
      studentId: { not: null },
    },
    select: { sectionId: true },
    distinct: ["sectionId"],
  });
  const markedIds = new Set(marked.map((m) => m.sectionId));

  const classStrength = new Map(
    (
      await db.student.groupBy({
        by: ["classId"],
        where: { schoolId, status: "ACTIVE" },
        _count: true,
      })
    ).map((r) => [r.classId, r._count]),
  );

  return {
    staff,
    sections: sections.map((s) => ({
      id: s.id,
      label: `${s.class.name} ${s.name}`,
      strength: s._count.students,
      marked: markedIds.has(s.id),
    })),
    timetable,
    marksPending: marksPending
      .map((e) => ({
        id: e.id,
        subject: e.subject?.name ?? e.name ?? "—",
        className: e.class?.name ?? "—",
        termName: e.examTerm.name,
        entered: e._count.results,
        expected: classStrength.get(e.classId ?? "") ?? 0,
      }))
      .filter((e) => e.entered < e.expected),
    homework,
    notifications,
    booksOut,
    examDutyToday: examDutyToday.map((d) => ({
      examId: d.examId,
      subject: d.exam.subject?.name ?? "—",
      className: d.exam.class?.name ?? "—",
      startTime: d.exam.startTime,
      roomNo: d.exam.roomNo,
    })),
  };
}

/** A parent sees their own children, and only their own children. */
export async function getParentHome(schoolId: string, userId: string, today = new Date()) {
  const links = await db.parentLink.findMany({
    where: { schoolId, userId },
    include: {
      student: {
        include: {
          class: { select: { name: true } },
          section: { select: { name: true, classTeacher: { select: { id: true, name: true } } } },
          invoices: { where: { status: { not: "CANCELLED" } } },
          attendance: { select: { status: true, date: true } },
          reportCards: {
            where: { publishedAt: { not: null } },
            orderBy: { generatedAt: "desc" },
            take: 1,
            include: { examTerm: true },
          },
          bookIssues: { where: { returnedOn: null }, include: { book: { select: { title: true } } } },
        },
      },
    },
  });

  const children = await Promise.all(
    links.map(async (l) => {
      const s = l.student;
      const att = summariseAttendance(s.attendance as never);
      const dues = summariseDues(s.invoices, today);

      // Same reach the child's own homework screen uses — a parent should see
      // what is due without having to log in as the child to find out.
      const homeworkDue = s.classId
        ? await db.homework.findMany({
            where: {
              schoolId,
              classId: s.classId,
              OR: [{ sectionId: s.sectionId }, { sectionId: null }],
              dueOn: { gte: dayStartOf(today) },
              status: { not: "DRAFT" },
            },
            orderBy: { dueOn: "asc" },
            take: 4,
            select: { id: true, title: true, dueOn: true, subject: { select: { name: true } } },
          })
        : [];

      const upcomingExams = s.classId ? await getUpcomingExams(schoolId, s.classId, today) : [];

      return {
        id: s.id,
        name: s.name,
        admissionNumber: s.admissionNumber,
        sectionId: s.sectionId,
        className: `${s.class?.name ?? "—"}${s.section ? ` ${s.section.name}` : ""}`,
        classTeacher: s.section?.classTeacher?.name ?? null,
        classTeacherUserId: s.section?.classTeacher?.id ?? null,
        attendance: att,
        eligibility: eligibilityCheck({
          presentDays: att.presentDays,
          workingDays: att.workingDays,
          remainingDays: Math.max(0, 200 - att.workingDays),
        }),
        dues,
        invoices: s.invoices
          .filter((i) => outstandingOf(i) > 0)
          .sort((a, b) => a.dueDate.getTime() - b.dueDate.getTime()),
        latestCard: s.reportCards[0] ?? null,
        booksOut: s.bookIssues.map((b) => ({ title: b.book.title, dueOn: b.dueOn })),
        homeworkDue,
        upcomingExams,
      };
    }),
  );

  const [circulars, events] = await Promise.all([
    db.circular.findMany({
      where: { schoolId, publishedAt: { not: null }, audience: { in: ["ALL", "PARENTS"] } },
      orderBy: { publishedAt: "desc" },
      take: 5,
    }),
    db.calendarEvent.findMany({
      where: { schoolId, isPublic: true, startDate: { gte: dayStartOf(today) } },
      orderBy: { startDate: "asc" },
      take: 5,
    }),
  ]);

  return { children, circulars, events };
}

/** A student's own day: timetable, homework, marks, attendance, books. */
export async function getStudentHome(schoolId: string, userId: string, today = new Date()) {
  const day = dayStartOf(today);
  const dayOfWeek = ((day.getUTCDay() + 6) % 7) + 1;

  const student = await db.student.findFirst({
    where: { schoolId, userId },
    include: {
      class: { select: { id: true, name: true } },
      section: { select: { id: true, name: true, classTeacher: { select: { name: true } } } },
      attendance: { select: { status: true, date: true }, orderBy: { date: "desc" } },
      invoices: { where: { status: { not: "CANCELLED" } } },
      reportCards: {
        where: { publishedAt: { not: null } },
        orderBy: { generatedAt: "desc" },
        take: 1,
        include: { examTerm: true },
      },
      bookIssues: { where: { returnedOn: null }, include: { book: { select: { title: true } } } },
      examResults: {
        where: { state: "PUBLISHED" },
        orderBy: { enteredAt: "desc" },
        take: 8,
        include: { exam: { include: { subject: true, examTerm: true } } },
      },
    },
  });
  if (!student) return null;

  const [timetable, homework, circulars, upcomingExams] = await Promise.all([
    db.timetableEntry.findMany({
      where: { schoolId, sectionId: student.sectionId ?? undefined, dayOfWeek },
      orderBy: { period: "asc" },
      include: { subject: { select: { name: true } }, staff: { include: { user: { select: { name: true } } } } },
    }),
    db.homework.findMany({
      where: {
        schoolId,
        classId: student.classId ?? undefined,
        OR: [{ sectionId: student.sectionId }, { sectionId: null }],
        dueOn: { gte: day },
        status: { not: "DRAFT" },
      },
      orderBy: { dueOn: "asc" },
      take: 6,
      include: { subject: { select: { name: true } } },
    }),
    db.circular.findMany({
      where: { schoolId, publishedAt: { not: null }, audience: { in: ["ALL", "STUDENTS"] } },
      orderBy: { publishedAt: "desc" },
      take: 4,
    }),
    student.classId ? getUpcomingExams(schoolId, student.classId, today) : Promise.resolve([]),
  ]);

  const att = summariseAttendance(student.attendance as never);

  return {
    student,
    attendance: att,
    eligibility: eligibilityCheck({
      presentDays: att.presentDays,
      workingDays: att.workingDays,
      remainingDays: Math.max(0, 200 - att.workingDays),
    }),
    dues: summariseDues(student.invoices, today),
    timetable,
    homework,
    circulars,
    upcomingExams,
    latestCard: student.reportCards[0] ?? null,
    results: student.examResults,
    booksOut: student.bookIssues,
  };
}
