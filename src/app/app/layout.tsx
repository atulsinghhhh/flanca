import { SessionProvider } from "next-auth/react";
import { requireActor, currentSchool } from "@/lib/session";
import { SideNav } from "@/components/shell/nav";
import { Wordmark } from "@/components/shell/mark";
import { TopBar } from "@/components/shell/top-bar";
import { getUnreadThreadCount } from "@/lib/queries/chat";
import { getUnreadNotificationCount } from "@/lib/queries/notifications";
import { tutorOn } from "@/lib/queries/tutor";

const ROLE_LABELS: Record<string, string> = {
  OWNER: "Management",
  PRINCIPAL: "Principal",
  ADMIN: "Office",
  ACCOUNTANT: "Accounts",
  TEACHER: "Teacher",
  LIBRARIAN: "Library",
  STUDENT: "Student",
  PARENT: "Parent",
};

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const actor = await requireActor();
  const school = await currentSchool(actor.schoolId);

  // One indexed count on the participant rows. It is here rather than in each
  // page because this layout is the only thing every role passes through.
  const [unreadChats, unreadNotifications] = await Promise.all([
    getUnreadThreadCount(actor.schoolId, actor.id),
    getUnreadNotificationCount(actor.schoolId, actor.id),
  ]);

  const trialNote =
    school.status === "TRIAL" && school.trialEndsAt
      ? `Trial ends ${school.trialEndsAt.toLocaleDateString("en-IN", { day: "numeric", month: "short" })}`
      : null;

  return (
    <SessionProvider>
      <div className="min-h-dvh lg:grid lg:grid-cols-[248px_1fr]">
        <aside className="sticky top-0 hidden h-dvh flex-col overflow-y-auto border-r border-line bg-paper lg:flex">
          <div className="flex h-14 shrink-0 items-center px-5">
            <Wordmark />
          </div>
          <SideNav roles={actor.roles} unreadChats={unreadChats} tutorOn={tutorOn()} />
        </aside>

        <div className="min-w-0">
          <TopBar
            schoolName={school.name}
            yearName={school.currentYear?.name ?? "—"}
            userName={actor.name}
            roleLabel={ROLE_LABELS[actor.roles[0]] ?? "Staff"}
            roles={actor.roles}
            trialNote={trialNote}
            unreadChats={unreadChats}
            unreadNotifications={unreadNotifications}
            tutorOn={tutorOn()}
          />
          <main className="px-4 py-6 sm:px-6 lg:px-8">{children}</main>
        </div>
      </div>
    </SessionProvider>
  );
}
