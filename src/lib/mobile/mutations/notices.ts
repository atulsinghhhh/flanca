import { db } from "@/lib/db";
import { audit, type Actor } from "@/lib/session";

type Failure = { ok: false; status: number; code: string; message: string };

export type PublishCircularInput = {
  title: string;
  body: string;
  audience: string; // ALL | PARENTS | TEACHERS | STUDENTS | STAFF | CLASS:<id>
  isPublic?: boolean;
};

export type PublishCircularResult = Failure | { ok: true; circularId: string; inApp: number };

/**
 * The mobile-API twin of src/app/app/notices/actions.ts::publishCircular —
 * same recipient resolution, same audience values. Deliberately IN_APP only:
 * the web compose form can also queue paid SMS/WhatsApp sends with a real
 * cost per recipient, which is desk work that belongs on a screen with room
 * to show that cost before someone taps send, not a phone compose sheet.
 */
export async function publishCircularForActor(actor: Actor, input: PublishCircularInput): Promise<PublishCircularResult> {
  const title = input.title.trim();
  const body = input.body.trim();
  if (!title) return { ok: false, status: 422, code: "empty_title", message: "Give the notice a title." };
  if (!body) return { ok: false, status: 422, code: "empty_body", message: "A notice needs a body." };

  const circular = await db.circular.create({
    data: {
      schoolId: actor.schoolId,
      title,
      body,
      audience: input.audience,
      isPublic: input.isPublic ?? false,
      publishedAt: new Date(),
      createdBy: actor.id,
    },
  });

  const recipients = await resolveRecipients(actor.schoolId, input.audience);

  if (recipients.userIds.length > 0) {
    await db.notification.createMany({
      data: recipients.userIds.map((userId) => ({
        schoolId: actor.schoolId,
        userId,
        kind: "CIRCULAR",
        title,
        body: body.slice(0, 280),
        linkUrl: `/app/notices`,
      })),
      skipDuplicates: true,
    });
  }

  await audit({
    schoolId: actor.schoolId,
    actorId: actor.id,
    action: "circular.publish",
    entity: "Circular",
    entityId: circular.id,
    summary: `Published "${title}" to ${input.audience.toLowerCase()} — ${recipients.userIds.length} in-app`,
  });

  return { ok: true, circularId: circular.id, inApp: recipients.userIds.length };
}

/** Mirrors src/app/app/notices/actions.ts's private resolveRecipients — who a
 * given audience value actually reaches, bounded to real school relationships. */
async function resolveRecipients(schoolId: string, audience: string) {
  if (audience.startsWith("CLASS:")) {
    const classId = audience.slice(6);
    const students = await db.student.findMany({
      where: { schoolId, classId, status: "ACTIVE" },
      select: { parentLinks: { select: { userId: true } } },
    });
    return { userIds: students.flatMap((s) => s.parentLinks.map((p) => p.userId)) };
  }

  if (audience === "TEACHERS" || audience === "STAFF") {
    const staff = await db.staff.findMany({
      where: { schoolId, isActive: true, ...(audience === "TEACHERS" ? { department: "Academics" } : {}) },
      select: { userId: true },
    });
    return { userIds: staff.map((s) => s.userId) };
  }

  const students = await db.student.findMany({
    where: { schoolId, status: "ACTIVE" },
    select: { userId: true, parentLinks: { select: { userId: true } } },
  });

  const parentUserIds = students.flatMap((s) => s.parentLinks.map((p) => p.userId));
  const studentUserIds = students.map((s) => s.userId).filter((id): id is string => Boolean(id));

  if (audience === "STUDENTS") return { userIds: studentUserIds };
  if (audience === "PARENTS") return { userIds: parentUserIds };

  // ALL: everyone with a login — families and staff both.
  const staff = await db.staff.findMany({ where: { schoolId, isActive: true }, select: { userId: true } });
  return { userIds: [...new Set([...parentUserIds, ...studentUserIds, ...staff.map((s) => s.userId)])] };
}
