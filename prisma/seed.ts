/**
 * Flanca demo seed — "Subhash Academy", Bhopal.
 *
 * A real ~600-student CBSE school (Nursery through Class 12, senior secondary
 * split into Science-Maths/Science-Biology/Commerce/Arts streams), not a
 * handful of test rows: money that adds up, a term of attendance, a completed exam cycle,
 * defaulters at every age bucket, and an APAAR backlog exactly like the one a
 * school is sitting on in August 2026.
 *
 * Deterministic (seeded PRNG) so every demo run looks identical.
 */
import { PrismaClient, type Prisma } from "@prisma/client";
import bcrypt from "bcryptjs";
import {
  BLOOD_GROUPS, BOOK_TITLES, BOY_FIRST, CATEGORIES, CO_SCHOLASTIC, FATHER_FIRST,
  GIRL_FIRST, LOCALITIES, MOTHER_FIRST, MOTHER_TONGUES, RELIGIONS, SUBJECTS_MIDDLE,
  SUBJECTS_PRIMARY, SUBJECTS_SECONDARY, SURNAMES, TEACHER_NAMES,
} from "./seed-data";

const db = new PrismaClient();

// ── deterministic PRNG (mulberry32) so the demo never shifts under us
let seedState = 0x9e3779b9;
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

const TODAY = new Date(Date.UTC(2026, 7, 19)); // 19 Aug 2026 — inside the APAAR crunch
const YEAR_START = new Date(Date.UTC(2026, 3, 1));
const YEAR_END = new Date(Date.UTC(2027, 2, 31));

const CLASS_NAMES = [
  "Nursery","LKG","UKG",
  "Class 1","Class 2","Class 3","Class 4","Class 5",
  "Class 6","Class 7","Class 8","Class 9","Class 10","Class 11","Class 12",
];

// Senior secondary (Class 11/12) splits into four streams. The schema ties a
// Subject to a Class, not a Section, so every stream's subjects are offered at
// the class level — same simplification the rest of the school already lives
// with (every section of, say, Class 6 shares Class 6's subject list too).
const SENIOR_SECONDARY_STREAMS = ["Science (Maths)", "Science (Biology)", "Commerce", "Arts"];
const SENIOR_SECONDARY_SUBJECTS = [
  "English", "Physics", "Chemistry", "Mathematics", "Biology",
  "Accountancy", "Business Studies", "Economics", "History", "Political Science",
];

function subjectsFor(className: string): string[] {
  if (["Nursery", "LKG", "UKG"].includes(className)) return ["English","Hindi","Numbers","Rhymes","Drawing"];
  if (["Class 11", "Class 12"].includes(className)) return SENIOR_SECONDARY_SUBJECTS;
  const n = Number(className.replace("Class ", ""));
  if (n <= 5) return SUBJECTS_PRIMARY;
  if (n <= 8) return SUBJECTS_MIDDLE;
  return SUBJECTS_SECONDARY;
}

/** Annual tuition rises with the class — as it does in every real school. */
function annualTuition(className: string): number {
  const idx = CLASS_NAMES.indexOf(className);
  return paise(21000 + idx * 2200);
}

function addDays(d: Date, days: number): Date {
  return new Date(d.getTime() + days * 86_400_000);
}

function isWorkingDay(d: Date): boolean {
  const day = d.getUTCDay();
  return day !== 0; // Sundays off; second Saturdays handled as holidays below
}

async function main() {
  console.log("→ clearing any previous demo data");
  await db.school.deleteMany({ where: { slug: "nalanda-public-school" } });
  // Not "@nalandapublic.edu.in": a parent's address is
  // father.name.1317@parent.subhashacademy.edu.in, which does not contain that string
  // at all — the "@" sits before "parent". So every re-seed used to leave the parent
  // logins behind, and the next run of add-role-logins died on a duplicate email.
  await db.user.deleteMany({ where: { email: { contains: "subhashacademy.edu.in" } } });
  // Earlier demo runs (before the school was renamed) left stray logins on the old
  // domain — wipe those too so a re-seed never resurrects a "Nalanda" login.
  await db.user.deleteMany({ where: { email: { contains: "nalandapublic.edu.in" } } });

  const pw = await bcrypt.hash("flanca123", 10);

  // ─────────────────────────────── school ───────────────────────────────
  console.log("→ school + academic year");
  const school = await db.school.create({
    data: {
      name: "Subhash Academy",
      slug: "nalanda-public-school",
      board: "CBSE",
      status: "TRIAL",
      trialEndsAt: addDays(TODAY, 27),
      studentCap: 1500,
      city: "Bhopal",
      state: "Madhya Pradesh",
      address: "Plot 14, Arera Colony, Bhopal, Madhya Pradesh 462016",
      phone: "0755 4001234",
      email: "office@subhashacademy.edu.in",
      website: "https://subhashacademy.edu.in",
      principalName: "Praveen Yadav",
      udiseCode: "23220100512",
      affiliationNo: "1030456",
      upiId: "subhashacademy@sbi",
      upiPayeeName: "Subhash Academy",
      bankName: "State Bank of India",
      bankAccountNo: "38291045612",
      bankIfsc: "SBIN0004512",
    },
  });

  const year = await db.academicYear.create({
    data: {
      schoolId: school.id,
      name: "2026-27",
      startDate: YEAR_START,
      endDate: YEAR_END,
      isCurrent: true,
    },
  });

  // ─────────────────────────────── people: office & staff ───────────────────────────────
  console.log("→ staff + logins");
  async function makeUser(name: string, email: string, phone: string, roles: Array<Prisma.SchoolRoleCreateManyInput["role"]>) {
    return db.user.create({
      data: {
        name, email, phone, passwordHash: pw,
        roles: { create: roles.map((role) => ({ schoolId: school.id, role })) },
      },
    });
  }

  const principal = await makeUser("Praveen Yadav", "principal@subhashacademy.edu.in", "9826010001", ["PRINCIPAL", "OWNER"]);
  const clerk = await makeUser("Ramesh Kushwaha", "office@subhashacademy.edu.in", "9826010002", ["ADMIN"]);
  const accountant = await makeUser("Sudha Mandloi", "accounts@subhashacademy.edu.in", "9826010003", ["ACCOUNTANT"]);
  const librarian = await makeUser("Kailash Verma", "library@subhashacademy.edu.in", "9826010004", ["LIBRARIAN"]);

  await db.staff.createMany({
    data: [
      // Names chosen not to collide with the teaching staff: the accountant used to be
      // called Neelam Pandey and the librarian Gopal Yadav, both of whom are also
      // teachers here, which made every staff picker ambiguous.
      { schoolId: school.id, userId: principal.id, employeeId: "SA-001", designation: "Principal", department: "Administration", joiningDate: new Date(Date.UTC(2016, 5, 1)), qualification: "M.A., Ph.D., B.Ed.", basicPay: paise(92000), phone: "9826010001", gender: "MALE" },
      { schoolId: school.id, userId: clerk.id, employeeId: "SA-002", designation: "Office Superintendent", department: "Administration", joiningDate: new Date(Date.UTC(2018, 3, 12)), qualification: "B.Com.", basicPay: paise(31000), phone: "9826010002", gender: "MALE" },
      { schoolId: school.id, userId: accountant.id, employeeId: "SA-003", designation: "Accountant", department: "Accounts", joiningDate: new Date(Date.UTC(2019, 6, 1)), qualification: "M.Com.", basicPay: paise(36000), phone: "9826010003", gender: "FEMALE" },
      { schoolId: school.id, userId: librarian.id, employeeId: "SA-004", designation: "Librarian", department: "Library", joiningDate: new Date(Date.UTC(2020, 6, 15)), qualification: "B.Lib.Sc.", basicPay: paise(24000), phone: "9826010004", gender: "MALE" },
    ],
  });

  const teachers: Array<{ staffId: string; userId: string; name: string }> = [];
  for (let i = 0; i < TEACHER_NAMES.length; i++) {
    const [name, gender] = TEACHER_NAMES[i];
    const slug = name.toLowerCase().replace(/[^a-z ]/g, "").split(" ").slice(0, 2).join(".");
    const user = await makeUser(name, `${slug}@subhashacademy.edu.in`, `98260200${String(i).padStart(2, "0")}`, ["TEACHER"]);
    const staff = await db.staff.create({
      data: {
        schoolId: school.id, userId: user.id, employeeId: `SA-1${String(i + 10).padStart(2, "0")}`,
        designation: i < 4 ? "Senior Teacher" : "Teacher",
        department: "Academics",
        joiningDate: new Date(Date.UTC(2017 + (i % 8), (i * 3) % 12, 1 + (i % 27))),
        qualification: pick(["B.Sc., B.Ed.", "M.A., B.Ed.", "M.Sc., B.Ed.", "B.A., B.Ed.", "M.Com., B.Ed."]),
        basicPay: paise(26000 + i * 900),
        gender,
        phone: `98260200${String(i).padStart(2, "0")}`,
      },
    });
    teachers.push({ staffId: staff.id, userId: user.id, name });
  }

  // ─────────────────────────────── classes, sections, subjects ───────────────────────────────
  console.log("→ classes, sections, subjects");
  const classes: Array<{ id: string; name: string; sections: Array<{ id: string; name: string }>; subjects: Array<{ id: string; name: string }> }> = [];

  for (let ci = 0; ci < CLASS_NAMES.length; ci++) {
    const name = CLASS_NAMES[ci];
    const cls = await db.class.create({ data: { schoolId: school.id, name, sequenceOrder: ci } });

    const isSeniorSecondary = ["Class 11", "Class 12"].includes(name);
    const sectionCount = ci < 3 ? 1 : isSeniorSecondary ? SENIOR_SECONDARY_STREAMS.length : 2;
    const sections = [];
    for (let s = 0; s < sectionCount; s++) {
      const sectionName = isSeniorSecondary ? SENIOR_SECONDARY_STREAMS[s] : String.fromCharCode(65 + s);
      const teacher = teachers[(ci * 2 + s) % teachers.length];
      const section = await db.section.create({
        data: {
          schoolId: school.id, classId: cls.id, name: sectionName,
          classTeacherId: teacher.userId, capacity: 45, roomNo: `${ci + 1}0${s + 1}`,
        },
      });
      sections.push({ id: section.id, name: sectionName });
    }

    const subjects = [];
    for (const subjectName of subjectsFor(name)) {
      const subject = await db.subject.create({
        data: { schoolId: school.id, classId: cls.id, name: subjectName, code: subjectName.slice(0, 3).toUpperCase() },
      });
      subjects.push({ id: subject.id, name: subjectName });
    }
    if (ci >= 3) {
      for (const co of CO_SCHOLASTIC) {
        await db.subject.create({
          data: { schoolId: school.id, classId: cls.id, name: co, isCoScholastic: true },
        });
      }
    }

    classes.push({ id: cls.id, name, sections, subjects });
  }

  // teachers ↔ subjects
  const allSubjects = await db.subject.findMany({ where: { schoolId: school.id } });
  for (let i = 0; i < allSubjects.length; i++) {
    await db.staffSubject.create({
      data: { staffId: teachers[i % teachers.length].staffId, subjectId: allSubjects[i].id },
    });
  }

  // ─────────────────────────────── fee heads, structures, installments ───────────────────────────────
  console.log("→ fee structures");
  const headNames = [
    { name: "Tuition Fee", order: 1 },
    { name: "Development Fee", order: 2 },
    { name: "Examination Fee", order: 3 },
    { name: "Computer Lab", order: 4 },
    { name: "Library", order: 5 },
    { name: "Sports & Activity", order: 6 },
    { name: "Transport", order: 7, optional: true },
  ];
  const heads: Record<string, string> = {};
  for (const h of headNames) {
    const created = await db.feeHead.create({
      data: { schoolId: school.id, name: h.name, sequenceOrder: h.order, isOptional: h.optional ?? false },
    });
    heads[h.name] = created.id;
  }

  const concessionTypes: Record<string, string> = {};
  for (const c of [
    { name: "Sibling Concession", percentage: 10 },
    { name: "Staff Ward", percentage: 50 },
    { name: "RTE (25%)", percentage: 100 },
    { name: "Merit Scholarship", percentage: 25 },
    { name: "EWS Support", fixedAmount: paise(6000) },
  ]) {
    const created = await db.concessionType.create({
      data: { schoolId: school.id, name: c.name, percentage: c.percentage ?? null, fixedAmount: c.fixedAmount ?? null },
    });
    concessionTypes[c.name] = created.id;
  }

  const TERMS = [
    { label: "Term 1 (Apr–Jun)", dueDate: new Date(Date.UTC(2026, 3, 15)) },
    { label: "Term 2 (Jul–Sep)", dueDate: new Date(Date.UTC(2026, 6, 15)) },
    { label: "Term 3 (Oct–Dec)", dueDate: new Date(Date.UTC(2026, 9, 15)) },
    { label: "Term 4 (Jan–Mar)", dueDate: new Date(Date.UTC(2027, 0, 15)) },
  ];

  const structureByClass: Record<string, { id: string; installments: Array<{ id: string; label: string; dueDate: Date }>; lines: Array<{ head: string; amount: number }> }> = {};

  for (const cls of classes) {
    const tuition = annualTuition(cls.name);
    const isSenior = ["Class 9", "Class 10", "Class 11", "Class 12"].includes(cls.name);
    const lines = [
      { head: "Tuition Fee", amount: tuition },
      { head: "Development Fee", amount: paise(3600) },
      { head: "Examination Fee", amount: paise(1200) },
      { head: "Library", amount: paise(600) },
      { head: "Sports & Activity", amount: paise(1800) },
      ...(isSenior || CLASS_NAMES.indexOf(cls.name) >= 6 ? [{ head: "Computer Lab", amount: paise(2400) }] : []),
    ];

    const structure = await db.feeStructure.create({
      data: {
        schoolId: school.id, academicYearId: year.id, classId: cls.id,
        name: `${cls.name} — 2026-27`, frequency: "TERM",
        items: { create: lines.map((l) => ({ feeHeadId: heads[l.head], amount: l.amount })) },
      },
    });

    const installments = [];
    for (let t = 0; t < TERMS.length; t++) {
      const inst = await db.installmentPlan.create({
        data: {
          schoolId: school.id, feeStructureId: structure.id,
          label: TERMS[t].label, dueDate: TERMS[t].dueDate, percentage: 25, sequenceOrder: t,
        },
      });
      installments.push({ id: inst.id, label: TERMS[t].label, dueDate: TERMS[t].dueDate });
    }

    structureByClass[cls.id] = { id: structure.id, installments, lines };
  }

  await db.lateFinePolicy.create({
    data: { schoolId: school.id, graceDays: 10, perDayAmount: paise(10), flatAmount: paise(100), maxAmount: paise(1000) },
  });

  await db.ledgerAccount.createMany({
    data: [
      { schoolId: school.id, name: "Fee Income", group: "INCOME" },
      { schoolId: school.id, name: "Transport Income", group: "INCOME" },
      { schoolId: school.id, name: "Salaries", group: "EXPENSE" },
      { schoolId: school.id, name: "Electricity & Water", group: "EXPENSE" },
      { schoolId: school.id, name: "Cash in Hand", group: "CASH" },
      { schoolId: school.id, name: "SBI Current A/c", group: "BANK" },
    ],
  });

  console.log("→ transport routes");
  const routes = [];
  for (const r of [
    { name: "Route 1 — Arera / Shahpura", vehicleNo: "MP04 CA 2311", driver: "Shivraj Meena" },
    { name: "Route 2 — Kolar Road", vehicleNo: "MP04 CA 2312", driver: "Balram Dangi" },
    { name: "Route 3 — Bairagarh", vehicleNo: "MP04 CA 2313", driver: "Nasir Khan" },
    { name: "Route 4 — Govindpura / Karond", vehicleNo: "MP04 CA 2314", driver: "Prem Ahirwar" },
  ]) {
    const route = await db.transportRoute.create({
      data: {
        schoolId: school.id, name: r.name, vehicleNo: r.vehicleNo,
        driverName: r.driver, driverPhone: `9425${int(100000, 999999)}`, capacity: 40,
      },
    });
    const stops = [];
    for (let i = 0; i < 4; i++) {
      const stop = await db.transportStop.create({
        data: {
          schoolId: school.id, routeId: route.id, name: `${pick(LOCALITIES)} Stop ${i + 1}`,
          pickupTime: `0${6 + Math.floor(i / 2)}:${i % 2 === 0 ? "30" : "50"}`,
          dropTime: `1${4 + Math.floor(i / 2)}:${i % 2 === 0 ? "15" : "40"}`,
          monthlyFee: paise(800 + i * 100), sequenceOrder: i,
        },
      });
      stops.push(stop.id);
    }
    routes.push({ id: route.id, stops });
  }

  console.log("→ students (this is the big one)");
  type SeedStudent = { id: string; classId: string; sectionId: string; name: string; className: string };
  const students: SeedStudent[] = [];
  let admissionCounter = 1000;

  for (const cls of classes) {
    const classIdxForCount = CLASS_NAMES.indexOf(cls.name);
    // Sized to land the whole school in the 500–700 range this product is built
    // for: pre-primary runs smaller, and each Class 11/12 stream runs smaller
    // still (as it does at a real school, once some leave after Class 10 and the
    // batch splits four ways).
    const perSection =
      ["Class 11", "Class 12"].includes(cls.name) ? int(12, 18)
      : int(18, 24);

    for (const section of cls.sections) {
      for (let i = 0; i < perSection; i++) {
        admissionCounter++;
        const isBoy = chance(0.52);
        const first = isBoy ? pick(BOY_FIRST) : pick(GIRL_FIRST);
        const surname = pick(SURNAMES);
        const name = `${first} ${surname}`;
        const classIdx = CLASS_NAMES.indexOf(cls.name);
        const birthYear = 2026 - (classIdx + 3);

        // APAAR reality in Aug 2026: most issued, a real backlog remaining.
        const apaarRoll = rnd();
        const apaarIssued = apaarRoll < 0.82;
        const apaarMismatch = !apaarIssued && apaarRoll < 0.88;
        const consentRefused = !apaarIssued && !apaarMismatch && apaarRoll < 0.90;

        // Aadhaar name deliberately drifts for the mismatch cases — the real failure mode.
        const aadhaarName = apaarMismatch
          ? chance(0.5) ? `${surname} ${first}` : `${first} ${pick(["Kumar", "Devi", "Prasad"])} ${surname}`
          : name;

        const student = await db.student.create({
          data: {
            schoolId: school.id,
            admissionNumber: `SA/${admissionCounter}`,
            name,
            dob: new Date(Date.UTC(birthYear, int(0, 11), int(1, 28))),
            gender: isBoy ? "MALE" : "FEMALE",
            classId: cls.id,
            sectionId: section.id,
            rollNumber: i + 1,
            status: "ACTIVE",
            admissionDate: new Date(Date.UTC(2026 - int(0, Math.min(classIdx, 5)), 3, int(1, 20))),
            bloodGroup: pick(BLOOD_GROUPS),
            address: `${int(1, 240)}, ${pick(LOCALITIES)}, Bhopal`,
            category: pick(CATEGORIES),
            religion: pick(RELIGIONS),
            motherTongue: pick(MOTHER_TONGUES),
            fatherName: `${pick(FATHER_FIRST)} ${surname}`,
            motherName: `${pick(MOTHER_FIRST)} ${surname}`,
            guardianPhone: `9${pick(["4", "8", "7"])}${int(10000000, 99999999)}`,
            apaarId: apaarIssued ? `${int(10, 99)}${int(1000000000, 9999999999)}` : null,
            penNumber: apaarIssued ? `PEN${int(10000000, 99999999)}` : null,
            aadhaarName,
            apaarStatus: apaarIssued ? "ISSUED" : apaarMismatch ? "MISMATCH" : consentRefused ? "CONSENT_REFUSED" : "CONSENT_PENDING",
            apaarNote: apaarMismatch ? "UDISE+ rejected: name does not match Aadhaar" : null,
            apaarUpdatedAt: addDays(TODAY, -int(1, 40)),
          },
        });

        students.push({ id: student.id, classId: cls.id, sectionId: section.id, name, className: cls.name });

        await db.studentEnrollment.create({
          data: {
            schoolId: school.id, studentId: student.id, academicYearId: year.id,
            classId: cls.id, sectionId: section.id, rollNumber: i + 1,
          },
        });

        // DPDP consent records — the register no competitor has.
        const consentState = apaarIssued ? "GRANTED" : consentRefused ? "REFUSED" : chance(0.55) ? "GRANTED" : "PENDING";
        for (const purpose of ["ENROLMENT_DATA", "APAAR_GENERATION", "PHOTO_MEDIA", "COMMUNICATION"] as const) {
          const state = purpose === "ENROLMENT_DATA" ? "GRANTED" : consentState;
          await db.consentRecord.create({
            data: {
              schoolId: school.id, studentId: student.id, purpose,
              state: state as never,
              verifiedVia: state === "GRANTED" ? pick(["OTP_PHONE", "SIGNED_FORM", "IN_PERSON_ID"]) : null,
              grantedByName: state === "GRANTED" ? `${pick(FATHER_FIRST)} ${surname}` : null,
              grantedAt: state === "GRANTED" ? addDays(TODAY, -int(20, 120)) : null,
              refusedAt: state === "REFUSED" ? addDays(TODAY, -int(5, 60)) : null,
              noticeVersion: "v1.0-2026",
            },
          });
        }

        // transport for about a third
        if (chance(0.32)) {
          const route = pick(routes);
          await db.studentTransport.create({
            data: {
              schoolId: school.id, studentId: student.id, routeId: route.id,
              stopId: pick(route.stops), fromDate: YEAR_START,
            },
          });
        }
      }
    }
  }
  console.log(`   ${students.length} students`);

  await db.school.update({ where: { id: school.id }, data: { updatedAt: new Date() } });
  console.log("✓ base seed complete");
  return { school, year, classes, students, teachers, heads, structureByClass, concessionTypes, pw, principal, clerk, accountant };
}

main()
  .then(async () => {
    await db.$disconnect();
  })
  .catch(async (e) => {
    console.error(e);
    await db.$disconnect();
    process.exit(1);
  });
