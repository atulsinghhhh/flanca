import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronRight } from "lucide-react";
import { db } from "@/lib/db";
import { requireActor } from "@/lib/session";
import { canStartThread } from "@/lib/core/chat-core";
import { getChatPerson, getChatStudent, getStartableContacts, type Contact } from "@/lib/queries/chat";
import { Empty } from "@/components/ui/primitives";
import { StartForm } from "../start-form";
import { PaneHeader } from "../pane-header";
import { Avatar } from "../avatar";

export const metadata = { title: "New conversation — Flanca" };

export default async function NewChatPage({
  searchParams,
}: {
  searchParams: Promise<{ to?: string; student?: string; circular?: string }>;
}) {
  const actor = await requireActor();
  const sp = await searchParams;

  const me = await getChatPerson(actor.schoolId, actor.id);
  if (!me) notFound();

  // A reply to a notice addresses whoever published it — the recipient is derived
  // from the circular rather than trusted from the URL, so a crafted link cannot
  // turn "reply to the school" into a conversation with somebody else.
  const circular = sp.circular
    ? await db.circular.findFirst({
        where: { id: sp.circular, schoolId: actor.schoolId, publishedAt: { not: null } },
        select: { id: true, title: true, createdBy: true },
      })
    : null;
  const to = circular?.createdBy ?? sp.to;

  if (sp.circular && !circular?.createdBy) {
    return (
      <>
        <PaneHeader title="Reply to the school" />
        <div className="flex-1 overflow-y-auto">
          <Empty
            title="There is nobody to reply to on that notice."
            hint="It was posted without an author on record. Write to the office instead."
          />
        </div>
      </>
    );
  }

  // A chosen recipient is authorised against chat-core directly, not against the
  // list below — the list is a convenience, and the links into this page come from
  // the student profile, the parent's own screen and a notice as well as from here.
  if (to) {
    const [target, student] = await Promise.all([
      getChatPerson(actor.schoolId, to),
      sp.student ? getChatStudent(actor.schoolId, sp.student) : Promise.resolve(null),
    ]);

    const verdict = target
      ? canStartThread({ initiator: me, target, student })
      : { allowed: false, reason: "That person is not part of this school." };

    if (!target || !verdict.allowed) {
      return (
        <>
          <PaneHeader title="New conversation" />
          <div className="flex-1 overflow-y-auto">
            <Empty
              title={verdict.reason ?? "You cannot start that conversation."}
              hint="A parent can write to their own child's class teacher, the office and accounts. Staff can write to each other, and to the families they teach."
            />
          </div>
        </>
      );
    }

    const [name, studentName] = await Promise.all([nameOf(actor.schoolId, to), studentNameOf(actor.schoolId, sp.student)]);

    return (
      <>
        <PaneHeader avatarName={name ?? "?"} title={name ?? "Someone at the school"} sub={studentName ? `About ${studentName}` : undefined} />
        <div className="min-h-0 flex-1 overflow-y-auto">
          <StartForm
            targetUserId={to}
            targetName={name ?? "them"}
            studentId={sp.student ?? null}
            studentName={studentName}
            circularId={circular?.id ?? null}
            circularTitle={circular?.title ?? null}
          />
        </div>
      </>
    );
  }

  const contacts = await getStartableContacts(actor.schoolId, me);
  const groups = groupBy(contacts);

  return (
    <>
      <PaneHeader title="Who would you like to write to?" sub="Only the people the school intends you to reach appear here." />

      <div className="min-h-0 flex-1 overflow-y-auto">
        {contacts.length === 0 ? (
          <Empty
            title="There is nobody for you to write to yet."
            hint="A parent needs a child with a class teacher assigned. If that looks wrong, the office can check the section's class teacher."
          />
        ) : (
          groups.map(([group, items]) => (
            <div key={group}>
              <p className="sticky top-0 bg-paper-2/80 px-4 py-1.5 text-[11.5px] font-semibold tracking-wide text-ink-3 uppercase backdrop-blur">
                {group}
              </p>
              <ul className="divide-y divide-line">
                {items.map((c) => (
                  <li key={`${c.userId}-${c.studentId ?? "none"}`}>
                    <Link
                      href={`/app/chat/new?to=${c.userId}${c.studentId ? `&student=${c.studentId}` : ""}`}
                      className="flex items-center gap-3 px-4 py-2.5 hover:bg-paper-2/60"
                    >
                      <Avatar name={c.name} size="sm" />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-[13.5px] font-medium">{c.name}</span>
                        <span className="block truncate text-[12px] text-ink-3">
                          {c.role}
                          {c.studentName ? ` · ${c.studentName}` : ""}
                        </span>
                      </span>
                      <ChevronRight className="size-4 shrink-0 text-ink-3" />
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))
        )}
      </div>
    </>
  );
}

/** Group order is deliberate: the people you are most likely to want come first. */
const ORDER = ["Your children", "Families you teach", "Parents", "The office", "Accounts", "Colleagues"];

function groupBy(contacts: Contact[]): Array<[string, Contact[]]> {
  const map = new Map<string, Contact[]>();
  for (const c of contacts) map.set(c.group, [...(map.get(c.group) ?? []), c]);
  return [...map.entries()].sort((a, b) => {
    const ai = ORDER.indexOf(a[0]);
    const bi = ORDER.indexOf(b[0]);
    return (ai === -1 ? 99 : ai) - (bi === -1 ? 99 : bi);
  });
}

async function nameOf(schoolId: string, userId: string) {
  const row = await db.user.findFirst({
    where: { id: userId, roles: { some: { schoolId } } },
    select: { name: true },
  });
  return row?.name ?? null;
}

async function studentNameOf(schoolId: string, studentId?: string) {
  if (!studentId) return null;
  const row = await db.student.findFirst({ where: { id: studentId, schoolId }, select: { name: true } });
  return row?.name ?? null;
}
