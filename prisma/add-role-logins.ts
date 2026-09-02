import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";
import { threadKeyFor } from "../src/lib/core/chat-core";

const db = new PrismaClient();

/**
 * Give a slice of the demo school real parent and student logins.
 *
 * Only a slice: a school that has just switched on genuinely does NOT have a
 * login for every parent, and the product must look right in that state too.
 */
async function main() {
  const school = await db.school.findUnique({ where: { slug: "nalanda-public-school" } });
  if (!school) throw new Error("seed first");

  const pw = await bcrypt.hash("flanca123", 10);

  const students = await db.student.findMany({
    where: { schoolId: school.id, status: "ACTIVE", class: { sequenceOrder: { gte: 6 } } },
    orderBy: { admissionNumber: "asc" },
    take: 40,
    include: { class: true },
  });

  let parents = 0;
  let logins = 0;

  for (const s of students) {
    // student login
    if (!s.userId) {
      const slug = s.name.toLowerCase().replace(/[^a-z]/g, ".");
      const email = `${slug}.${s.admissionNumber.split("/").pop()}@subhashacademy.edu.in`;
      if (await db.user.findUnique({ where: { email }, select: { id: true } })) continue;
      const user = await db.user.create({
        data: {
          name: s.name,
          email,
          passwordHash: pw,
          roles: { create: { schoolId: school.id, role: "STUDENT" } },
        },
      });
      await db.student.update({ where: { id: s.id }, data: { userId: user.id } });
      logins++;
    }

    // parent login
    const existing = await db.parentLink.findFirst({ where: { studentId: s.id } });
    if (!existing && s.fatherName) {
      const slug = s.fatherName.toLowerCase().replace(/[^a-z]/g, ".");
      const email = `${slug}.${s.admissionNumber.split("/").pop()}@parent.subhashacademy.edu.in`;
      // Idempotent: this script runs after the seed and sometimes by hand, and a
      // parent who already has a login should be linked rather than recreated.
      if (await db.user.findUnique({ where: { email }, select: { id: true } })) continue;
      const user = await db.user.create({
        data: {
          name: s.fatherName,
          email,
          phone: s.guardianPhone,
          passwordHash: pw,
          roles: { create: { schoolId: school.id, role: "PARENT" } },
        },
      });
      await db.parentLink.create({
        data: {
          schoolId: school.id,
          studentId: s.id,
          userId: user.id,
          relation: "FATHER",
          isPrimary: true,
        },
      });
      parents++;
    }
  }

  console.log(`student logins: ${logins}, parent logins: ${parents}`);

  // ─────────────────────── a parent with two children ───────────────────────
  //
  // Every parent above is created from one student's admission number, so no demo
  // parent has a second child — and "one parent, two class teachers, two separate
  // conversations" is exactly the case that breaks a chat built on the wrong key.
  // Give one father a second child so it can actually be seen on screen.
  const linked = await db.student.findMany({
    where: { schoolId: school.id, userId: { not: null }, sectionId: { not: null } },
    orderBy: { admissionNumber: "asc" },
    include: { parentLinks: true, class: true, section: true },
  });

  const eldest = linked[0];
  const sibling = linked.find((s) => s.sectionId !== eldest?.sectionId);
  const fatherId = eldest?.parentLinks[0]?.userId;

  if (eldest && sibling && fatherId) {
    const already = await db.parentLink.findFirst({ where: { studentId: sibling.id, userId: fatherId } });
    if (!already) {
      await db.parentLink.create({
        data: {
          schoolId: school.id,
          studentId: sibling.id,
          userId: fatherId,
          relation: "GUARDIAN",
          isPrimary: false,
        },
      });
      console.log(`second child: ${sibling.name} (${sibling.class?.name} ${sibling.section?.name}) linked to the same guardian`);
    }
  }

  // ─────────────────────────── a few conversations ───────────────────────────
  //
  // Chat is worthless to demo empty, and worse than worthless faked: these are
  // real rows through the real schema, written the way the action writes them.
  const TODAY = new Date(Date.UTC(2026, 7, 19));
  const hoursAgo = (h: number) => new Date(TODAY.getTime() - h * 3_600_000);

  const officeUser = await db.user.findFirst({
    where: { roles: { some: { schoolId: school.id, role: "ADMIN" } } },
    select: { id: true },
  });

  type Seeded = { studentId: string | null; withUserId: string; parentUserId: string; lines: Array<[string, string, number]> };
  const plans: Seeded[] = [];

  // A demo conversation that calls a girl "him", or a male class teacher "ma'am", is
  // the first thing a school reads and the first thing that tells them this was
  // written by a machine. Both facts are in the records, so use them.
  const staffGender = new Map(
    (
      await db.staff.findMany({
        where: { schoolId: school.id },
        select: { userId: true, gender: true },
      })
    ).map((st) => [st.userId, st.gender] as const),
  );
  const honorific = (userId: string) => (staffGender.get(userId) === "MALE" ? "sir" : "ma'am");
  const them = (g: string | null) => (g === "MALE" ? "him" : g === "FEMALE" ? "her" : "them");
  const they = (g: string | null) => (g === "MALE" ? "he" : g === "FEMALE" ? "she" : "they");

  for (const student of linked.slice(0, 4)) {
    const parentUserId = student.parentLinks[0]?.userId;
    const teacherUserId = student.section?.classTeacherId ?? null;
    if (!parentUserId || !teacherUserId) continue;

    const first = student.name.split(" ")[0];
    plans.push({
      studentId: student.id,
      withUserId: teacherUserId,
      parentUserId,
      lines: [
        [parentUserId, `Good morning ${honorific(teacherUserId)}. ${first} had a fever last night, so we are keeping ${them(student.gender)} home today. Please mark the leave.`, 26],
        [teacherUserId, "Noted, thank you for telling me early. I will mark it and send today's classwork this evening.", 24],
        [parentUserId, "Thank you so much.", 23],
      ],
    });
    break;
  }

  const second = linked[1];
  if (second?.section?.classTeacherId && second.parentLinks[0]) {
    plans.push({
      studentId: second.id,
      withUserId: second.section.classTeacherId,
      parentUserId: second.parentLinks[0].userId,
      lines: [
        [
          second.parentLinks[0].userId,
          `${honorific(second.section.classTeacherId)[0].toUpperCase()}${honorific(second.section.classTeacherId).slice(1)}, ${they(second.gender)} is finding the algebra homework difficult. Is there extra practice you would recommend?`,
          50,
        ],
        [
          second.section.classTeacherId,
          `Yes — exercise 4B, and I will go over it again in Thursday's period. Ask ${them(second.gender)} to bring ${
            second.gender === "MALE" ? "his" : second.gender === "FEMALE" ? "her" : "their"
          } doubts written down.`,
          47,
        ],
      ],
    });
  }

  const third = linked[2];
  if (officeUser && third?.parentLinks[0]) {
    plans.push({
      studentId: third.id,
      withUserId: officeUser.id,
      parentUserId: third.parentLinks[0].userId,
      lines: [
        [officeUser.id, `The transport fee for Term 2 is due on 25 August. The receipt for Term 1 is on the fees page if you need it.`, 5],
      ],
    });
  }

  let threads = 0;
  for (const plan of plans) {
    const participantIds = [plan.parentUserId, plan.withUserId];
    const threadKey = threadKeyFor({ kind: "DIRECT", userIds: participantIds, studentId: plan.studentId });

    const exists = await db.messageThread.findFirst({ where: { schoolId: school.id, threadKey } });
    if (exists) continue;

    const last = plan.lines[plan.lines.length - 1];
    const lastAt = hoursAgo(last[2]);

    // Unread sits with whoever did not speak last — the same rule the action applies.
    const thread = await db.messageThread.create({
      data: {
        schoolId: school.id,
        kind: "DIRECT",
        studentId: plan.studentId,
        threadKey,
        createdByUserId: plan.lines[0][0],
        createdAt: hoursAgo(plan.lines[0][2]),
        lastMessageAt: lastAt,
        lastSenderUserId: last[0],
        participants: {
          create: participantIds.map((userId) => ({
            userId,
            joinedAt: hoursAgo(plan.lines[0][2]),
            lastReadAt: userId === last[0] ? lastAt : hoursAgo(last[2] + 1),
            unreadCount: userId === last[0] ? 0 : 1,
          })),
        },
      },
      select: { id: true },
    });

    for (const [senderUserId, body, ago] of plan.lines) {
      await db.message.create({
        data: { threadId: thread.id, senderUserId, body, createdAt: hoursAgo(ago) },
      });
    }
    threads++;
  }
  console.log(`conversations: ${threads}`);

  const sample = await db.student.findFirst({
    where: { schoolId: school.id, userId: { not: null } },
    include: { user: { select: { email: true } }, parentLinks: { include: { user: { select: { email: true } } } } },
  });
  console.log(`demo student: ${sample?.user?.email}`);
  console.log(`demo parent:  ${sample?.parentLinks[0]?.user.email}`);

  await db.$disconnect();
}

main().catch(async (e) => { console.error(e); await db.$disconnect(); process.exit(1); });
