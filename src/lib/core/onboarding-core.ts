/**
 * A school's first hour, in order. Pure.
 *
 * This is deliberately the last thing built, not the first. A checklist is only
 * worth anything if every step it points at can actually be done — until this week a
 * school could not create an academic year, a term, a member of staff, an exam, a
 * timetable period, a concession or a bus route, so a checklist would have been a
 * list of dead ends with ticks next to the two things the seed happened to fill in.
 *
 * The order is not cosmetic: it is what depends on what. Fees cannot be priced
 * before there are classes to price; terms hang off a class's fee structure in the
 * schema, so they cannot exist before a class has fees; invoices need terms. A step
 * that is blocked says what it is waiting for rather than just sitting there grey.
 */

export type StepKey =
  | "school" | "year" | "classes" | "subjects" | "staff" | "classTeachers"
  | "students" | "feeHeads" | "feeAmounts" | "terms" | "invoices" | "timetable" | "exams";

export type SetupState = {
  hasSchoolDetails: boolean;
  hasCurrentYear: boolean;
  classes: number;
  sections: number;
  subjects: number;
  subjectsWithTeacher: number;
  teachers: number;
  sectionsWithClassTeacher: number;
  students: number;
  feeHeads: number;
  classesPriced: number;
  terms: number;
  invoicesRaised: number;
  timetabledSections: number;
  examCycles: number;
};

export type Step = {
  key: StepKey;
  title: string;
  /** why a school should care, in one line */
  why: string;
  href: string;
  done: boolean;
  /** what there is so far, for a school to recognise its own school */
  detail: string;
  /** set when an earlier step has to happen first */
  blockedBy: string | null;
  /** true when it is worth doing but the school can open without it */
  optional: boolean;
};

export function setupSteps(s: SetupState): Step[] {
  const steps: Step[] = [
    {
      key: "school",
      title: "The school's own details",
      why: "The name, board and address print on every receipt, certificate and report card.",
      href: "/app/settings",
      done: s.hasSchoolDetails,
      detail: s.hasSchoolDetails ? "Filled in" : "Name, board, address, phone",
      blockedBy: null,
      optional: false,
    },
    {
      key: "year",
      title: "The academic year",
      why: "Fees, exams, report cards and enrolments all belong to a year. Nothing else can be set up first.",
      href: "/app/settings/year",
      done: s.hasCurrentYear,
      detail: s.hasCurrentYear ? "Set, and current" : "Not set",
      blockedBy: null,
      optional: false,
    },
    {
      key: "classes",
      title: "Classes and sections",
      why: "Attendance is marked per section, and a child with no section never appears on a register.",
      href: "/app/settings/classes",
      done: s.classes > 0 && s.sections > 0,
      detail:
        s.classes === 0
          ? "None yet"
          : `${s.classes} ${s.classes === 1 ? "class" : "classes"}, ${s.sections} ${s.sections === 1 ? "section" : "sections"}`,
      blockedBy: s.hasCurrentYear ? null : "the academic year",
      optional: false,
    },
    {
      key: "staff",
      title: "Your people",
      why: "Each one gets a login. Nobody can mark a register, enter a mark or take a fee until they exist.",
      href: "/app/staff/new",
      done: s.teachers > 0,
      detail: s.teachers === 0 ? "Only you" : `${s.teachers} on strength`,
      blockedBy: null,
      optional: false,
    },
    {
      key: "students",
      title: "The roll",
      why: "Import your existing register in one go, or add children one at a time.",
      href: "/app/import",
      done: s.students > 0,
      detail: s.students === 0 ? "Nobody yet" : `${s.students.toLocaleString("en-IN")} children`,
      blockedBy: s.classes > 0 ? null : "classes to put them in",
      optional: false,
    },
    {
      key: "classTeachers",
      title: "Who holds each section",
      why: "A class teacher is the one line a section's parents have to the school — chat, attendance and report cards all run through it.",
      href: "/app/settings/classes",
      done: s.sections > 0 && s.sectionsWithClassTeacher >= s.sections,
      detail:
        s.sections === 0
          ? "No sections yet"
          : `${s.sectionsWithClassTeacher} of ${s.sections} sections have one`,
      blockedBy: s.teachers > 0 ? null : "staff to assign",
      optional: false,
    },
    {
      key: "subjects",
      title: "Subjects, and who teaches them",
      why: "Exam papers, the timetable and report cards are all built from this list.",
      href: "/app/settings/subjects",
      done: s.subjects > 0 && s.subjectsWithTeacher > 0,
      detail:
        s.subjects === 0
          ? "None yet"
          : `${s.subjects} subjects, ${s.subjectsWithTeacher} with a teacher`,
      blockedBy: s.classes > 0 ? null : "classes to attach them to",
      optional: false,
    },
    {
      key: "feeHeads",
      title: "What the school charges for",
      why: "Every head is its own line on the invoice — nothing is bundled into a vague total.",
      href: "/app/fees/structures",
      done: s.feeHeads > 0,
      detail: s.feeHeads === 0 ? "None yet" : `${s.feeHeads} heads`,
      blockedBy: null,
      optional: false,
    },
    {
      key: "feeAmounts",
      title: "How much, per class",
      why: "The annual fee for each class. A term invoice is divided out of this.",
      href: "/app/fees/structures",
      done: s.classes > 0 && s.classesPriced >= s.classes,
      detail:
        s.classes === 0 ? "No classes yet" : `${s.classesPriced} of ${s.classes} classes priced`,
      blockedBy: s.feeHeads > 0 ? null : "fee heads to price",
      optional: false,
    },
    {
      key: "terms",
      title: "Terms",
      why: "Fees are billed a term at a time. Four quarters, two halves, or twelve months.",
      href: "/app/settings/year",
      done: s.terms > 0,
      detail: s.terms === 0 ? "Not set" : `${s.terms} terms`,
      blockedBy: s.classesPriced > 0 ? null : "a priced class to attach them to",
      optional: false,
    },
    {
      key: "invoices",
      title: "Raise the first term",
      why: "Puts an itemised invoice in front of every family. Nothing is billed until you do this.",
      href: "/app/fees/raise",
      done: s.invoicesRaised > 0,
      detail: s.invoicesRaised === 0 ? "Nothing billed yet" : `${s.invoicesRaised.toLocaleString("en-IN")} invoices raised`,
      blockedBy: s.terms > 0 && s.students > 0 ? null : s.terms === 0 ? "terms" : "children on the roll",
      optional: false,
    },
    {
      key: "timetable",
      title: "The timetable",
      why: "Also decides which parents a subject teacher may message, and what a teacher sees on their own screen.",
      href: "/app/timetable",
      done: s.sections > 0 && s.timetabledSections >= s.sections,
      detail:
        s.sections === 0 ? "No sections yet" : `${s.timetabledSections} of ${s.sections} sections have one`,
      blockedBy: s.subjectsWithTeacher > 0 ? null : "subjects with teachers on them",
      optional: true,
    },
    {
      key: "exams",
      title: "The first exam cycle",
      why: "Marks and report cards hang off an exam. It can wait until the first unit test is near.",
      href: "/app/exams",
      done: s.examCycles > 0,
      detail: s.examCycles === 0 ? "None yet" : `${s.examCycles} ${s.examCycles === 1 ? "cycle" : "cycles"}`,
      blockedBy: s.subjects > 0 ? null : "subjects to examine",
      optional: true,
    },
  ];

  return steps;
}

/** How far along a school is, counting only what it cannot open without. */
export function setupProgress(steps: Step[]): { done: number; total: number; percentBp: number; nextUp: Step | null } {
  const required = steps.filter((x) => !x.optional);
  const done = required.filter((x) => x.done).length;
  const total = required.length;
  // The next thing to do is the first unfinished step that is not waiting on another
  // one — telling somebody to raise invoices before they have terms is worse than
  // saying nothing.
  const nextUp = steps.find((x) => !x.done && !x.blockedBy) ?? null;
  return { done, total, percentBp: total === 0 ? 0 : Math.round((done / total) * 10000), nextUp };
}
