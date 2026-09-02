/**
 * Proves the school side of the seam against the real database.
 *
 *   npx tsx scripts/check-seam.ts
 *
 * The pure rules have unit tests (src/lib/core/__tests__/tutor-core.test.ts).
 * This is the half those cannot reach: that the queries which decide WHO MAY
 * OPEN THE TUTOR FOR WHICH CHILD actually behave that way against real rows.
 *
 * It matters more here than in most places, because the tutor cannot help. It
 * authenticates the school's system, not the person holding the phone — its own
 * comments say so — which makes these two functions the entire guarantee that a
 * parent sees one child and a class teacher sees one section.
 *
 * Checkpoint 5 of the integrity checklist is in here too: revoke a parent's
 * link and the parent loses the child immediately. Nothing is cached, nothing
 * needs restarting, and the row goes back afterwards.
 */
import { db } from "../src/lib/db";
import { admissionNumberForEntry, childForParent } from "../src/lib/queries/tutor";
import { rosterFor, tutorClassLevelOf } from "../src/lib/core/tutor-core";

function say(ok: boolean, text: string) {
  console.log(`  ${ok ? "✓" : "✗"} ${text}`);
  if (!ok) process.exitCode = 1;
}

async function main() {
  const school = await db.school.findFirst({ select: { id: true, name: true } });
  if (!school) throw new Error("Seed a school first: pnpm db:seed");
  console.log(`\n${school.name}\n`);

  // A parent with a link, the child they are linked to, and a child they are not.
  const link = await db.parentLink.findFirst({
    where: { schoolId: school.id },
    select: {
      id: true,
      userId: true,
      relation: true,
      isPrimary: true,
      occupation: true,
      annualIncome: true,
      student: { select: { id: true, name: true, admissionNumber: true, classId: true, class: { select: { name: true } } } },
    },
  });
  if (!link) throw new Error("No parent links in this database.");

  const otherChild = await db.student.findFirst({
    where: { schoolId: school.id, status: "ACTIVE", id: { not: link.student.id }, classId: link.student.classId },
    select: { id: true, name: true, admissionNumber: true },
  });
  if (!otherChild) throw new Error("Need a second child in the same class.");

  console.log("── who may open the tutor for whom ──\n");

  const own = await admissionNumberForEntry({
    schoolId: school.id,
    actorId: link.userId,
    roles: ["PARENT"],
    studentId: link.student.id,
  });
  say(own?.admissionNumber === link.student.admissionNumber, `a parent, for their own child (${link.student.name})`);

  const notTheirs = await admissionNumberForEntry({
    schoolId: school.id,
    actorId: link.userId,
    roles: ["PARENT"],
    studentId: otherChild.id,
  });
  say(notTheirs === null, `the same parent, for a classmate (${otherChild.name}) — refused, and the refusal says nothing about whether that child exists`);

  // The class teacher of that child's section, and a teacher of another section.
  const section = await db.section.findFirst({
    where: { schoolId: school.id, classTeacherId: { not: null }, students: { some: { id: link.student.id } } },
    select: { id: true, name: true, classTeacherId: true },
  });
  const otherSection = await db.section.findFirst({
    where: { schoolId: school.id, classTeacherId: { not: null }, id: { not: section?.id ?? "" } },
    select: { name: true, classTeacherId: true },
  });

  if (section?.classTeacherId) {
    const mine = await admissionNumberForEntry({
      schoolId: school.id,
      actorId: section.classTeacherId,
      roles: ["TEACHER"],
      studentId: link.student.id,
    });
    say(mine !== null, `the class teacher of ${link.student.class?.name} ${section.name}, for a child in it`);
  }
  if (otherSection?.classTeacherId) {
    const notMine = await admissionNumberForEntry({
      schoolId: school.id,
      actorId: otherSection.classTeacherId,
      roles: ["TEACHER"],
      studentId: link.student.id,
    });
    say(notMine === null, `a class teacher of ${otherSection.name}, for a child who is not in her section — refused`);
  }

  const student = await db.student.findFirst({
    where: { schoolId: school.id, userId: { not: null }, status: "ACTIVE" },
    select: { id: true, userId: true, name: true },
  });
  // Deliberately not `otherChild`: the two searches can land on the same person,
  // and a test that compares a child with themselves passes for the wrong reason.
  const notThisStudent = await db.student.findFirst({
    where: { schoolId: school.id, status: "ACTIVE", id: { notIn: [student?.id ?? "", link.student.id] } },
    select: { id: true, name: true },
  });

  if (student?.userId && notThisStudent) {
    const self = await admissionNumberForEntry({
      schoolId: school.id,
      actorId: student.userId,
      roles: ["STUDENT"],
      studentId: student.id,
    });
    const someoneElse = await admissionNumberForEntry({
      schoolId: school.id,
      actorId: student.userId,
      roles: ["STUDENT"],
      studentId: notThisStudent.id,
    });
    say(self !== null, `a student, for themselves (${student.name})`);
    say(someoneElse === null, `the same student, for somebody else (${notThisStudent.name}) — refused`);
  }

  const office = await db.schoolRole.findFirst({
    where: { schoolId: school.id, role: { in: ["ADMIN", "PRINCIPAL", "OWNER"] } },
    select: { userId: true, role: true },
  });
  if (office) {
    const anyChild = await admissionNumberForEntry({
      schoolId: school.id,
      actorId: office.userId,
      roles: [office.role],
      studentId: otherChild.id,
    });
    say(anyChild !== null, `the office (${office.role}), for any child of the school`);
  }

  console.log("\n── checkpoint 5: revoke a parent's link ──\n");

  const before = await childForParent({ schoolId: school.id, parentUserId: link.userId, studentId: link.student.id });
  say(before !== null, "before: the parent's panel resolves to their child");

  await db.parentLink.delete({ where: { id: link.id } });
  const after = await childForParent({ schoolId: school.id, parentUserId: link.userId, studentId: link.student.id });
  const afterEntry = await admissionNumberForEntry({
    schoolId: school.id,
    actorId: link.userId,
    roles: ["PARENT"],
    studentId: link.student.id,
  });
  say(after === null, "after: the panel resolves to nothing — no cache, no restart, no request to the tutor at all");
  say(afterEntry === null, "after: and the one-click door is shut too");

  // Put it back exactly as it was.
  await db.parentLink.create({
    data: {
      id: link.id,
      schoolId: school.id,
      studentId: link.student.id,
      userId: link.userId,
      relation: link.relation,
      isPrimary: link.isPrimary,
      occupation: link.occupation,
      annualIncome: link.annualIncome,
    },
  });
  const restored = await childForParent({ schoolId: school.id, parentUserId: link.userId, studentId: link.student.id });
  say(restored !== null, "restored: the link is back, unchanged");

  console.log("\n── the roster this school would send ──\n");

  const students = await db.student.findMany({
    where: { schoolId: school.id },
    select: { admissionNumber: true, name: true, status: true, class: { select: { name: true } }, section: { select: { name: true } } },
  });
  const intent = rosterFor({
    students: students.map((s) => ({
      admissionNumber: s.admissionNumber,
      name: s.name,
      className: s.class?.name ?? null,
      section: s.section?.name ?? null,
      status: s.status,
    })),
    known: new Set(),
  });
  const outOfRange = students.filter((s) => s.status === "ACTIVE" && tutorClassLevelOf(s.class?.name ?? null) === null);
  console.log(`  whole school: ${intent.counts.send} sent, ${intent.counts.withdraw} withdrawn, ${intent.counts.ignored} leavers ignored`);
  console.log(`  of those sent, ${outOfRange.length} are in classes the tutor does not teach and will be refused BY NAME`);
  say(
    intent.lines.every((l) => !("email" in l)),
    "and not one line carries an email address",
  );

  console.log("");
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
