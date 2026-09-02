"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Archive, BadgeCheck, BedDouble, BookOpen, Bus, CalendarCheck2, CalendarDays, ClipboardCheck, Coins,
  FileCheck2, FileSpreadsheet, Grid2x2, GraduationCap, Home, IdCard, Landmark, LayoutGrid,
  Megaphone, MessageSquare, Package, ScrollText, Settings, ShieldCheck, Table2, UserPlus,
  Users, Wallet,
  CalendarRange,
  ListChecks,
  Sparkles,
  KeyRound,
} from "lucide-react";
import { cn } from "@/lib/utils";

type Role =
  | "OWNER" | "PRINCIPAL" | "ADMIN" | "ACCOUNTANT"
  | "TEACHER" | "LIBRARIAN" | "STUDENT" | "PARENT";

// `badge` names a live count the shell passes in; the nav itself counts nothing.
type Item = {
  href: string;
  label: string;
  icon: React.ElementType;
  roles?: Role[];
  badge?: "chat";
  /**
   * A second product this school may not have bought. An item behind a flag is
   * absent, not disabled: a nav entry for something a school has not paid for
   * teaches them to ignore the nav.
   */
  needs?: "tutor";
};

const OFFICE: Role[] = ["OWNER", "PRINCIPAL", "ADMIN"];
const MONEY: Role[] = ["OWNER", "PRINCIPAL", "ADMIN", "ACCOUNTANT"];
const TEACHING: Role[] = ["OWNER", "PRINCIPAL", "ADMIN", "TEACHER"];

const GROUPS: Array<{ label: string; items: Item[]; roles?: Role[] }> = [
  {
    label: "Today",
    items: [
      { href: "/app", label: "Overview", icon: Home },
      { href: "/app/attendance", label: "Attendance", icon: ClipboardCheck, roles: TEACHING },
      { href: "/app/chat", label: "Chat", icon: MessageSquare, badge: "chat" },
      { href: "/app/ptm", label: "Meetings", icon: CalendarCheck2 },
      { href: "/app/notices", label: "Notices", icon: Megaphone, roles: OFFICE },
      { href: "/app/calendar", label: "Calendar", icon: CalendarDays },
    ],
  },
  {
    label: "Students",
    roles: OFFICE,
    items: [
      { href: "/app/students", label: "All students", icon: Users },
      { href: "/app/students/logins", label: "Student logins", icon: KeyRound },
      { href: "/app/admissions", label: "Admissions", icon: UserPlus },
      { href: "/app/certificates", label: "Certificates", icon: ScrollText },
    ],
  },
  {
    label: "Money",
    roles: MONEY,
    items: [
      { href: "/app/fees", label: "Fees & dues", icon: Coins },
      { href: "/app/fees/collect", label: "Fee counter", icon: Wallet },
      { href: "/app/fees/structures", label: "Fee structure", icon: Table2 },
      { href: "/app/accounts", label: "Day book", icon: Landmark },
    ],
  },
  {
    label: "Academics",
    roles: TEACHING,
    items: [
      { href: "/app/exams", label: "Exams & marks", icon: GraduationCap },
      { href: "/app/report-cards", label: "Report cards", icon: FileCheck2 },
      { href: "/app/timetable", label: "Timetable", icon: LayoutGrid },
      { href: "/app/homework", label: "Homework", icon: BookOpen },
      { href: "/app/tutor", label: "AI Tutor", icon: Sparkles, roles: OFFICE, needs: "tutor" },
    ],
  },
  {
    label: "Compliance",
    roles: OFFICE,
    items: [
      { href: "/app/apaar", label: "APAAR & UDISE", icon: BadgeCheck },
      { href: "/app/consent", label: "Consent (DPDP)", icon: ShieldCheck },
    ],
  },
  {
    label: "School",
    roles: ["OWNER", "PRINCIPAL", "ADMIN", "LIBRARIAN"],
    items: [
      { href: "/app/staff", label: "Staff & payroll", icon: IdCard, roles: OFFICE },
      { href: "/app/library", label: "Library", icon: BookOpen },
      { href: "/app/transport", label: "Transport", icon: Bus },
      { href: "/app/hostel", label: "Hostel", icon: BedDouble },
      { href: "/app/stock", label: "Stock & assets", icon: Package },
      { href: "/app/gate", label: "Gate & visitors", icon: Archive },
    ],
  },
  {
    label: "Setup",
    roles: OFFICE,
    items: [
      { href: "/app/setup", label: "Setting up", icon: ListChecks },
      { href: "/app/settings/year", label: "Academic year", icon: CalendarRange },
      { href: "/app/settings/classes", label: "Classes & sections", icon: Grid2x2 },
      { href: "/app/settings/subjects", label: "Subjects", icon: GraduationCap },
      { href: "/app/import", label: "Import data", icon: FileSpreadsheet },
      { href: "/app/settings", label: "Settings", icon: Settings },
    ],
  },
];

export function SideNav({
  onNavigate,
  roles = [],
  unreadChats = 0,
  tutorOn = false,
}: {
  onNavigate?: () => void;
  roles?: string[];
  unreadChats?: number;
  /** Whether this deployment has the tutor at all. Decided on the server. */
  tutorOn?: boolean;
}) {
  const pathname = usePathname();

  // A teacher should not be shown the school's cash position, and a parent
  // should not be shown a nav at all beyond their own child.
  const allowed = (needed?: Role[]) =>
    !needed || roles.some((r) => needed.includes(r as Role));

  const bought = (needs?: Item["needs"]) => (needs === "tutor" ? tutorOn : true);

  const visible = GROUPS.filter((g) => allowed(g.roles))
    .map((g) => ({ ...g, items: g.items.filter((i) => allowed(i.roles) && bought(i.needs)) }))
    .filter((g) => g.items.length > 0);

  return (
    <nav className="flex flex-col gap-5 px-3 pb-8">
      {visible.map((group) => (
        <div key={group.label}>
          <p className="eyebrow text-ink-3 px-2.5 pb-1.5">{group.label}</p>
          <ul className="space-y-0.5">
            {group.items.map((item) => {
              // "/app" must not light up for every child route.
              const active =
                item.href === "/app" ? pathname === "/app" : pathname.startsWith(item.href);
              const Icon = item.icon;
              return (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    onClick={onNavigate}
                    className={cn(
                      "flex items-center gap-2.5 rounded-md px-2.5 py-[7px] text-[13.5px] font-medium transition-colors",
                      active
                        ? "bg-brand-light text-brand-ink"
                        : "text-ink-2 hover:bg-paper-2 hover:text-ink",
                    )}
                  >
                    <Icon className={cn("size-4 shrink-0", active ? "text-brand" : "text-ink-3")} />
                    <span className="truncate">{item.label}</span>
                    {item.badge === "chat" && unreadChats > 0 ? (
                      <span className="ml-auto rounded-full bg-brand px-1.5 py-0.5 text-[10.5px] font-semibold text-white tnum">
                        {unreadChats}
                      </span>
                    ) : null}
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </nav>
  );
}
