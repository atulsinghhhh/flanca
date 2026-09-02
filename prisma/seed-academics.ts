/**
 * Third seed pass: a finished exam cycle with published report cards and ranks,
 * a library in use, circulars, admissions in the pipeline, payroll, and the
 * small operational records (visitors, gate passes, stock) that make a school
 * feel like a school rather than a database.
 */
import { PrismaClient } from "@prisma/client";
import { CBSE_8_POINT, computeReport, gradeFor, percentBp, rankStudents } from "../src/lib/core/grading-core";
import { summariseAttendance } from "../src/lib/core/attendance-core";
import { buildTimetable, weekOfSlots } from "../src/lib/core/timetable-core";
import { BOOK_TITLES, BOY_FIRST, FATHER_FIRST, GIRL_FIRST, LOCALITIES, MOTHER_FIRST, SURNAMES } from "./seed-data";

const db = new PrismaClient();

let seedState = 0x5a6b7c8d;
function rnd(): number {
  seedState |= 0;
  seedState = (seedState + 0x6d2b79f5) | 0;
  let t = Math.imul(seedState ^ (seedState >>> 15), 1 | seedState);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}
const pick = <T,>(xs: readonly T[]): T => xs[Math.floor(rnd() * xs.length)];
const int = (min: number, max: number) => min + Math.floor(rnd() * (max - min + 1));
const chance = (p: number) => rnd() < p;
const paise = (r: number) => Math.round(r * 100);
const addDays = (d: Date, n: number) => new Date(d.getTime() + n * 86_400_000);

const TODAY = new Date(Date.UTC(2026, 7, 19));

async function main() {
  const school = await db.school.findUnique({
    where: { slug: "nalanda-public-school" },
    include: { academicYears: { where: { isCurrent: true } } },
  });
  if (!school) throw new Error("Run prisma/seed.ts first");
  const year = school.academicYears[0];

  const classes = await db.class.findMany({
    where: { schoolId: school.id },
    orderBy: { sequenceOrder: "asc" },
    include: { sections: true, subjects: true, students: { where: { status: "ACTIVE" } } },
  });
  const staff = await db.staff.findMany({ where: { schoolId: school.id }, include: { user: true } });
  const teachers = staff.filter((s) => s.designation?.includes("Teacher"));
  const principal = staff.find((s) => s.designation === "Principal")!;

  // ───────────────────── grading scheme ─────────────────────
  await db.gradingScheme.create({
    data: { schoolId: school.id, name: "CBSE 8-point", isDefault: true, bands: CBSE_8_POINT as never },
  });

  // ───────────────────── exam cycle: Unit Test 1 (published) + Half Yearly (upcoming) ─────────────────────
  console.log("→ exam cycle + marks + report cards");
  let resultCount = 0;
  let cardCount = 0;

  for (const cls of classes) {
    if (cls.sequenceOrder < 3) continue; // pre-primary is graded holistically, not examined

    const scholastic = cls.subjects.filter((s) => !s.isCoScholastic);

    const term1 = await db.examTerm.create({
      data: {
        schoolId: school.id, academicYearId: year.id, classId: cls.id,
        name: "Unit Test 1", startDate: new Date(Date.UTC(2026, 6, 6)), endDate: new Date(Date.UTC(2026, 6, 14)),
        weightage: 10, resultDate: new Date(Date.UTC(2026, 6, 24)), isPublished: true, sequenceOrder: 0,
      },
    });

    // The Half Yearly is scheduled but not yet sat — so the school always has one
    // cycle mid-flight, which is what August actually looks like.
    const half = await db.examTerm.create({
      data: {
        schoolId: school.id, academicYearId: year.id, classId: cls.id,
        name: "Half Yearly", startDate: new Date(Date.UTC(2026, 8, 21)), endDate: new Date(Date.UTC(2026, 9, 3)),
        weightage: 30, isPublished: false, sequenceOrder: 1,
      },
    });

    for (let si = 0; si < scholastic.length; si++) {
      const subject = scholastic[si];
      await db.exam.create({
        data: {
          schoolId: school.id, examTermId: half.id, classId: cls.id, subjectId: subject.id,
          name: `${subject.name} — Half Yearly`,
          examDate: new Date(Date.UTC(2026, 8, 21 + si)), startTime: "09:00",
          durationMins: 150, maxMarks: 80, passMarks: 27,
          roomNo: `${cls.sequenceOrder + 1}01`,
        },
      });
    }

    // Each student has a latent ability so results look like a real bell curve
    // instead of noise — and so ranks are stable and believable.
    const ability = new Map(cls.students.map((s) => [s.id, 0.45 + rnd() * 0.5]));

    const perStudentMarks = new Map<string, Array<{ subject: string; maxMarks: number; marks: number | null; isAbsent?: boolean }>>();

    for (let si = 0; si < scholastic.length; si++) {
      const subject = scholastic[si];
      const exam = await db.exam.create({
        data: {
          schoolId: school.id, examTermId: term1.id, classId: cls.id, subjectId: subject.id,
          name: `${subject.name} — Unit Test 1`,
          examDate: new Date(Date.UTC(2026, 6, 6 + si)), startTime: "09:00",
          durationMins: 90, maxMarks: 40, passMarks: 13,
        },
      });

      const rows: Array<Record<string, unknown>> = [];
      for (const student of cls.students) {
        const base = ability.get(student.id)!;
        const absent = chance(0.012);
        const raw = Math.round(40 * Math.min(1, Math.max(0.15, base + (rnd() - 0.5) * 0.22)));
        const marks = absent ? null : raw;
        const grade = absent ? null : gradeFor(percentBp(raw, 40), CBSE_8_POINT)?.grade ?? null;

        rows.push({
          schoolId: school.id, examId: exam.id, studentId: student.id,
          marks, isAbsent: absent, grade, state: "PUBLISHED",
          enteredBy: teachers[si % teachers.length].userId,
          enteredAt: new Date(Date.UTC(2026, 6, 16 + (si % 4))),
          clientKey: `mk:${exam.id}:${student.id}`,
        });

        const list = perStudentMarks.get(student.id) ?? [];
        list.push({ subject: subject.name, maxMarks: 40, marks, isAbsent: absent });
        perStudentMarks.set(student.id, list);
      }
      await db.examResult.createMany({ data: rows as never, skipDuplicates: true });
      resultCount += rows.length;
    }

    // report cards, with class ranks computed properly (ties share a rank)
    const attendanceRows = await db.attendance.findMany({
      where: { schoolId: school.id, classId: cls.id, studentId: { not: null } },
      select: { studentId: true, status: true, date: true },
    });
    const attByStudent = new Map<string, Array<{ date: Date; status: string }>>();
    for (const a of attendanceRows) {
      const list = attByStudent.get(a.studentId!) ?? [];
      list.push({ date: a.date, status: a.status });
      attByStudent.set(a.studentId!, list);
    }

    const computed = cls.students.map((student) => {
      const marks = perStudentMarks.get(student.id) ?? [];
      const report = computeReport(marks, CBSE_8_POINT);
      return { id: student.id, percentBp: report.percentBp, report, student };
    });

    const ranked = rankStudents(computed);

    for (const row of ranked) {
      const att = summariseAttendance((attByStudent.get(row.id) ?? []) as never);
      await db.reportCard.create({
        data: {
          schoolId: school.id, studentId: row.id, examTermId: term1.id,
          classId: cls.id, sectionId: row.student.sectionId,
          snapshot: {
            term: "Unit Test 1",
            subjects: row.report ? (perStudentMarks.get(row.id) ?? []) : [],
            failedSubjects: row.report.failedSubjects,
            result: row.report.result,
          } as never,
          totalMarks: row.report.totalMarks, maxMarks: row.report.maxMarks,
          percentage: row.report.percentBp, grade: row.report.grade,
          rankInClass: row.rank, attendancePercent: att.percentBp,
          classTeacherRemark: row.report.percentBp >= 8000
            ? "Consistent and attentive in class. Keep it up."
            : row.report.percentBp >= 6000
              ? "Steady progress. Needs to revise regularly."
              : "Needs close attention in Mathematics and Science. Parent meeting advised.",
          publishedAt: new Date(Date.UTC(2026, 6, 24)),
        },
      });
      cardCount++;
    }
  }
  console.log(`   ${resultCount} marks, ${cardCount} report cards`);

  // ───────────────────── timetable for every section ─────────────────────
  //
  // Two things this used to get wrong, and both showed. The teacher for a period was
  // a second, independent round-robin over the staff list, so 986 of 1,012 periods
  // were taken by somebody not assigned to that subject — the music teacher down for
  // Class 9 maths. Making the teacher follow the subject then produced 508 periods
  // where one teacher was wanted in two classrooms at once, because each subject has
  // one teacher and the same slot comes up in several classes.
  //
  // Arithmetic cannot fix that; it needs scheduling. buildTimetable walks the slots
  // and puts in each one a subject whose teacher is actually free, and reports what
  // it could not place rather than putting anybody in two rooms.
  console.log("\u2192 timetable");
  const subjectTeacher = new Map(
    (await db.staffSubject.findMany({ select: { staffId: true, subjectId: true } }))
      .map((l) => [l.subjectId, l.staffId] as const),
  );

  const sectionMeta = new Map<string, { classId: string; roomNo: string }>();
  const scheduleSections = [];
  for (const cls of classes) {
    const scholastic = cls.subjects.filter((s) => !s.isCoScholastic);
    if (!scholastic.length) continue;
    for (const [si, section] of cls.sections.entries()) {
      sectionMeta.set(section.id, { classId: cls.id, roomNo: `${cls.sequenceOrder + 1}0${si + 1}` });
      scheduleSections.push({
        sectionId: section.id,
        subjects: scholastic.map((s) => ({ subjectId: s.id, staffId: subjectTeacher.get(s.id) ?? null })),
      });
    }
  }

  const built = buildTimetable({
    slots: weekOfSlots([...sectionMeta.keys()]),
    sections: scheduleSections,
  });

  const timetableRows = built.entries.map((e) => {
    const meta = sectionMeta.get(e.sectionId)!;
    return {
      schoolId: school.id, classId: meta.classId, sectionId: e.sectionId, subjectId: e.subjectId,
      staffId: e.staffId,
      dayOfWeek: e.dayOfWeek, period: e.period,
      startTime: `${String(8 + Math.floor((e.period - 1) * 45 / 60)).padStart(2, "0")}:${String(((e.period - 1) * 45) % 60).padStart(2, "0")}`,
      roomNo: meta.roomNo,
    };
  });

  await db.timetableEntry.createMany({ data: timetableRows as never, skipDuplicates: true });
  console.log(
    `   ${timetableRows.length} periods, no teacher double-booked` +
      (built.unfilled.length > 0
        ? `; ${built.unfilled.length} periods left free because no subject's teacher was available`
        : ""),
  );

  // ───────────────────── homework, conduct, lesson plans ─────────────────────
  console.log("→ homework, conduct, lesson plans");
  const hwTitles = [
    ["Mathematics", "Exercise 4.2 — Q1 to Q12"],
    ["English", "Write a paragraph on 'A Rainy Day' (120 words)"],
    ["Science", "Draw and label the human digestive system"],
    ["Hindi", "पाठ 5 के प्रश्न-उत्तर लिखें"],
    ["Social Science", "Map work: rivers of India"],
    ["Computer Science", "Practise typing — 10 minutes daily"],
  ];
  for (const cls of classes.filter((c) => c.sequenceOrder >= 3)) {
    for (const section of cls.sections) {
      for (let i = 0; i < 6; i++) {
        const [subjName, title] = pick(hwTitles);
        const subject = cls.subjects.find((s) => s.name === subjName) ?? cls.subjects[0];
        await db.homework.create({
          data: {
            schoolId: school.id, classId: cls.id, sectionId: section.id, subjectId: subject.id,
            staffId: teachers[i % teachers.length].id, title,
            assignedOn: addDays(TODAY, -int(0, 12)), dueOn: addDays(TODAY, int(1, 4)),
          },
        });
      }
    }
  }

  const allStudents = await db.student.findMany({ where: { schoolId: school.id }, select: { id: true } });
  for (let i = 0; i < 80; i++) {
    const s = pick(allStudents);
    const merit = chance(0.6);
    await db.conductRecord.create({
      data: {
        schoolId: school.id, studentId: s.id, date: addDays(TODAY, -int(1, 90)),
        kind: merit ? pick(["MERIT", "ACHIEVEMENT"]) : pick(["CONCERN", "INCIDENT"]),
        title: merit
          ? pick(["First in inter-house quiz", "Helped a junior student", "Best handwriting — class", "Winner, 100m sprint", "Science exhibition — model selected"])
          : pick(["Homework not completed repeatedly", "Late to assembly", "Disturbing the class", "Incomplete uniform"]),
        points: merit ? int(2, 10) : -int(1, 5),
      },
    });
  }

  for (const cls of classes.filter((c) => c.sequenceOrder >= 6).slice(0, 5)) {
    for (const subject of cls.subjects.slice(0, 4)) {
      await db.lessonPlan.create({
        data: {
          schoolId: school.id, classId: cls.id, subjectId: subject.id,
          staffId: pick(teachers).id, weekOf: addDays(TODAY, -TODAY.getUTCDay() + 1),
          topic: `${subject.name}: ${pick(["Revision of last unit", "New chapter introduction", "Practical / activity week", "Problem-solving drill"])}`,
          objectives: "Students should be able to explain the core concept and solve two applied problems unaided.",
          activities: "Board work, group activity, 10-minute exit quiz.",
          completed: chance(0.5),
        },
      });
    }
  }

  // ───────────────────── library ─────────────────────
  console.log("→ library");
  let accession = 1001;
  const bookIds: string[] = [];
  const bookCopies: [string, number][] = [];
  for (const [title, author, category] of BOOK_TITLES) {
    const copies = int(2, 6);
    const book = await db.book.create({
      data: {
        schoolId: school.id, accessionNo: `SA-L-${accession++}`,
        isbn: `978${int(1000000000, 9999999999)}`, title, author, category,
        publisher: pick(["NCERT", "Rupa", "Penguin India", "Scholastic India", "Arihant", "Delhi Press"]),
        totalCopies: copies, availableCopies: copies, price: paise(int(120, 650)),
        shelf: `${pick(["A", "B", "C", "D"])}-${int(1, 12)}`,
      },
    });
    bookIds.push(book.id);
    bookCopies.push([book.id, copies]);
  }

  const seniorStudents = await db.student.findMany({
    where: { schoolId: school.id, class: { sequenceOrder: { gte: 6 } } },
    select: { id: true }, take: 300,
  });
  // How many copies of each title are out right now, so the library never lends a
  // book it does not own. canIssue refuses this in the app; the seed used to do it
  // 90 times blind and left one title with six copies out of four.
  const onLoan = new Map<string, number>();
  const copiesOf = new Map<string, number>(bookCopies);

  for (let i = 0; i < 90; i++) {
    const bookId = pick(bookIds);
    const issuedOn = addDays(TODAY, -int(1, 45));
    const dueOn = addDays(issuedOn, 14);
    // A book cannot be returned next week. The return date has to land inside
    // [issued + 3 days, today] — and when a book went out two days ago there is no
    // such date, so it is simply still out. Without this clamp roughly one issue in
    // seven came back in the future, which is the kind of impossible row a librarian
    // spots in the first minute of a demo.
    const earliest = addDays(issuedOn, 3);
    const canBeBack = earliest <= TODAY;
    const returned = canBeBack && chance(0.62);
    const latest = Math.min(addDays(issuedOn, 22).getTime(), TODAY.getTime());
    const returnedOn = returned
      ? new Date(earliest.getTime() + Math.round(Math.random() * (latest - earliest.getTime())))
      : null;
    const overdueDays = returnedOn ? Math.max(0, Math.round((returnedOn.getTime() - dueOn.getTime()) / 86_400_000)) : 0;

    // A loan that is still open takes a copy off the shelf. If every copy is already
    // out, this loan simply does not happen — a library cannot lend a seventh copy of
    // a book it has four of.
    if (!returned && (onLoan.get(bookId) ?? 0) >= (copiesOf.get(bookId) ?? 0)) continue;

    await db.bookIssue.create({
      data: {
        schoolId: school.id, bookId, studentId: pick(seniorStudents).id,
        issuedOn, dueOn, returnedOn,
        fineAmount: overdueDays > 0 ? paise(overdueDays * 2) : 0,
        finePaid: overdueDays > 0 ? chance(0.7) : false,
      },
    });
    if (!returned) {
      onLoan.set(bookId, (onLoan.get(bookId) ?? 0) + 1);
      await db.book.update({ where: { id: bookId }, data: { availableCopies: { decrement: 1 } } });
    }
  }

  // ───────────────────── circulars, calendar ─────────────────────
  console.log("→ circulars + calendar");
  const circulars = [
    { title: "Independence Day celebration — 15 August", body: "All students are to report by 7:30 am in full white uniform. The flag hoisting will be followed by cultural programmes in the main ground. Parents are welcome.", audience: "ALL", isPublic: true, daysAgo: 8 },
    { title: "Half Yearly examination datesheet released", body: "The Half Yearly examinations will be held from 21 September to 3 October 2026. The detailed datesheet is available with class teachers and on the school notice board.", audience: "PARENTS", isPublic: true, daysAgo: 3 },
    { title: "APAAR ID — parent consent forms", body: "As per the Ministry of Education directive, an APAAR ID is mandatory for every student in 2026-27. Parents who have not yet submitted the consent form are requested to do so at the school office by 5 September. Please bring the student's Aadhaar card.", audience: "PARENTS", isPublic: false, daysAgo: 6 },
    { title: "Second term fee — due date 15 July", body: "Parents are requested to clear the second term fee. Payment can be made by UPI directly to the school with no extra charge, or at the fee counter between 9 am and 1 pm.", audience: "PARENTS", isPublic: false, daysAgo: 40 },
    { title: "Staff meeting — Saturday 3 pm", body: "All teaching staff to attend the review meeting in the conference room. Agenda: Half Yearly preparation, HPC entries, CPD hours.", audience: "TEACHERS", isPublic: false, daysAgo: 2 },
    { title: "Inter-house sports week", body: "The annual inter-house sports week begins 12 September. House captains to submit team lists to the PE department by 30 August.", audience: "ALL", isPublic: true, daysAgo: 1 },
  ];
  for (const c of circulars) {
    await db.circular.create({
      data: {
        schoolId: school.id, title: c.title, body: c.body, audience: c.audience,
        isPublic: c.isPublic, publishedAt: addDays(TODAY, -c.daysAgo), createdBy: principal.userId,
      },
    });
  }

  const events = [
    { title: "Independence Day", kind: "HOLIDAY", start: new Date(Date.UTC(2026, 7, 15)) },
    { title: "Raksha Bandhan", kind: "HOLIDAY", start: new Date(Date.UTC(2026, 7, 28)) },
    { title: "Janmashtami", kind: "HOLIDAY", start: new Date(Date.UTC(2026, 8, 4)) },
    { title: "Teachers' Day celebration", kind: "EVENT", start: new Date(Date.UTC(2026, 8, 5)) },
    { title: "Parent-Teacher Meeting (Classes 6–10)", kind: "PTM", start: new Date(Date.UTC(2026, 8, 12)) },
    { title: "Half Yearly Examinations", kind: "EXAM", start: new Date(Date.UTC(2026, 8, 21)), end: new Date(Date.UTC(2026, 9, 3)) },
    { title: "Gandhi Jayanti", kind: "HOLIDAY", start: new Date(Date.UTC(2026, 9, 2)) },
    { title: "Inter-house Sports Week", kind: "ACTIVITY", start: new Date(Date.UTC(2026, 8, 12)), end: new Date(Date.UTC(2026, 8, 18)) },
    { title: "Diwali Break", kind: "HOLIDAY", start: new Date(Date.UTC(2026, 10, 6)), end: new Date(Date.UTC(2026, 10, 12)) },
  ];
  for (const e of events) {
    await db.calendarEvent.create({
      data: { schoolId: school.id, title: e.title, kind: e.kind, startDate: e.start, endDate: e.end ?? null, isPublic: true },
    });
  }

  // ───────────────────── admissions pipeline ─────────────────────
  console.log("→ admissions pipeline");
  for (let i = 0; i < 26; i++) {
    const isBoy = chance(0.5);
    const name = `${isBoy ? pick(BOY_FIRST) : pick(GIRL_FIRST)} ${pick(SURNAMES)}`;
    await db.enquiry.create({
      data: {
        schoolId: school.id, studentName: name, classSought: pick(["Nursery", "LKG", "Class 1", "Class 4", "Class 6", "Class 9"]),
        parentName: `${pick(FATHER_FIRST)} ${pick(SURNAMES)}`,
        phone: `9${pick(["4", "8", "7"])}${int(10000000, 99999999)}`,
        source: pick(["WEBSITE", "WALK_IN", "PHONE", "REFERRAL"]),
        status: pick(["NEW", "NEW", "CONTACTED", "VISITED", "CONVERTED", "LOST"]),
        message: pick(["Looking for admission for the coming session.", "Shifting to Bhopal in October.", "Asked about transport on Kolar Road.", "Wants to know the fee structure."]),
        createdAt: addDays(TODAY, -int(1, 60)),
      },
    });
  }

  let appNo = 1;
  for (let i = 0; i < 18; i++) {
    const isBoy = chance(0.5);
    await db.application.create({
      data: {
        schoolId: school.id, applicationNo: `APP/26-27/${String(appNo++).padStart(4, "0")}`,
        studentName: `${isBoy ? pick(BOY_FIRST) : pick(GIRL_FIRST)} ${pick(SURNAMES)}`,
        dob: new Date(Date.UTC(2026 - int(4, 12), int(0, 11), int(1, 28))),
        gender: isBoy ? "MALE" : "FEMALE",
        classSought: pick(["Nursery", "LKG", "Class 1", "Class 5", "Class 8"]),
        parentName: `${pick(FATHER_FIRST)} ${pick(SURNAMES)}`,
        phone: `9${pick(["4", "8", "7"])}${int(10000000, 99999999)}`,
        address: `${int(1, 240)}, ${pick(LOCALITIES)}, Bhopal`,
        previousSchool: chance(0.6) ? pick(["Little Angels School", "St. Xavier's Bhopal", "Sagar Public School", "Home schooled"]) : null,
        status: pick(["SUBMITTED", "SUBMITTED", "UNDER_REVIEW", "DOCUMENTS_PENDING", "SHORTLISTED", "OFFERED"]),
        submittedAt: addDays(TODAY, -int(1, 40)),
      },
    });
  }

  // ───────────────────── payroll (July 2026) ─────────────────────
  console.log("→ payroll");
  for (const s of staff) {
    const basic = s.basicPay ?? paise(25000);
    const hra = Math.round(basic * 0.2);
    const pf = Math.round(basic * 0.12);
    await db.staffSalary.create({
      data: {
        schoolId: school.id, staffId: s.id, month: 7, year: 2026,
        basic,
        allowances: [{ label: "HRA", amount: hra }, { label: "Conveyance", amount: paise(1200) }] as never,
        deductions: [{ label: "PF", amount: pf }, { label: "Professional Tax", amount: paise(200) }] as never,
        daysPresent: int(24, 26), daysPayable: 26,
        netPay: basic + hra + paise(1200) - pf - paise(200),
        paidAt: new Date(Date.UTC(2026, 7, 3)), mode: "NEFT",
      },
    });
  }

  // ───────────────────── inventory, assets, gate ─────────────────────
  console.log("→ stock, assets, gate log");
  for (const item of [
    { name: "A4 Paper (ream)", group: "STATIONERY", qty: 42, reorder: 20, price: paise(280) },
    { name: "Whiteboard Marker", group: "STATIONERY", qty: 156, reorder: 50, price: paise(25) },
    { name: "School Diary", group: "STATIONERY", qty: 88, reorder: 100, price: paise(120) },
    { name: "House T-shirt (M)", group: "UNIFORM", qty: 34, reorder: 25, price: paise(320) },
    { name: "Chemistry Lab — Test Tubes", group: "LAB", qty: 210, reorder: 100, price: paise(18) },
    { name: "Cricket Ball (leather)", group: "SPORTS", qty: 9, reorder: 12, price: paise(450) },
    { name: "Floor Cleaner (5L)", group: "HOUSEKEEPING", qty: 14, reorder: 10, price: paise(410) },
  ]) {
    const created = await db.inventoryItem.create({
      data: {
        schoolId: school.id, name: item.name, group: item.group,
        quantity: item.qty, reorderAt: item.reorder, unitPrice: item.price,
        supplier: pick(["Bhopal Stationers", "Nayak Traders", "Sagar Sports House", "Local Vendor"]),
      },
    });
    await db.inventoryTxn.create({
      data: {
        schoolId: school.id, itemId: created.id, kind: "IN", quantity: item.qty + int(10, 40),
        reason: "Opening purchase", billNo: `B-${int(1000, 9999)}`, date: addDays(TODAY, -int(20, 90)),
      },
    });
  }

  for (const a of [
    { name: "Interactive Panel — Class 10A", tag: "SA-IT-011", cost: paise(78000), amc: "Sharp Vision Systems" },
    { name: "Desktop Computers (Lab) ×20", tag: "SA-IT-002", cost: paise(560000), amc: "Bhopal Compute Care" },
    { name: "Water Purifier — Block B", tag: "SA-GEN-014", cost: paise(32000), amc: "AquaServe" },
    { name: "Generator 15 kVA", tag: "SA-GEN-001", cost: paise(240000), amc: "MP Power Solutions" },
    { name: "CCTV System (16 channel)", tag: "SA-SEC-003", cost: paise(96000), amc: "SecureEye" },
  ]) {
    await db.asset.create({
      data: {
        schoolId: school.id, name: a.name, tag: a.tag, cost: a.cost,
        purchaseDate: addDays(TODAY, -int(200, 1400)), amcVendor: a.amc,
        amcExpiry: addDays(TODAY, int(-30, 300)),
        location: pick(["Block A", "Block B", "Computer Lab", "Admin Office"]),
        condition: pick(["GOOD", "GOOD", "GOOD", "NEEDS_REPAIR"]),
      },
    });
  }

  for (let i = 0; i < 24; i++) {
    const inAt = addDays(TODAY, -int(0, 12));
    await db.visitor.create({
      data: {
        schoolId: school.id, name: `${pick(FATHER_FIRST)} ${pick(SURNAMES)}`,
        phone: `9${int(100000000, 999999999)}`,
        purpose: pick(["Parent meeting", "Fee payment", "Admission enquiry", "Vendor delivery", "Document collection"]),
        whomToMeet: pick(["Principal", "Office", "Class Teacher", "Accounts"]),
        idProof: pick(["Aadhaar", "Driving Licence", "Voter ID"]),
        inAt, outAt: chance(0.85) ? new Date(inAt.getTime() + int(15, 90) * 60000) : null,
        passNo: `V-${int(1000, 9999)}`,
      },
    });
  }

  console.log("✓ academics seed complete");
  await db.$disconnect();
}

main().catch(async (e) => {
  console.error(e);
  await db.$disconnect();
  process.exit(1);
});
