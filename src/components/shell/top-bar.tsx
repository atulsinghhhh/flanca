"use client";

import { useState } from "react";
import { LogOut, Menu, X } from "lucide-react";
import { signOut } from "next-auth/react";
import { SideNav } from "./nav";
import { Wordmark } from "./mark";
import { NotificationBell } from "./notification-bell";

export function TopBar({
  schoolName,
  yearName,
  userName,
  roleLabel,
  trialNote,
  roles,
  unreadChats = 0,
  unreadNotifications = 0,
  tutorOn = false,
}: {
  schoolName: string;
  yearName: string;
  userName: string;
  roleLabel: string;
  trialNote?: string | null;
  roles: string[];
  unreadChats?: number;
  unreadNotifications?: number;
  tutorOn?: boolean;
}) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <header className="app-header sticky top-0 z-30 border-b border-line bg-paper/95 backdrop-blur">
        <div className="flex h-14 items-center gap-3 px-4">
          <button
            onClick={() => setOpen(true)}
            className="-ml-1 rounded-md p-2 text-ink-2 hover:bg-paper-2 lg:hidden"
            aria-label="Open menu"
          >
            <Menu className="size-5" />
          </button>

          <div className="lg:hidden">
            <Wordmark />
          </div>

          <div className="hidden min-w-0 lg:block">
            <p className="truncate text-[14.5px] font-semibold leading-tight">{schoolName}</p>
            <p className="text-[12px] leading-tight text-ink-3">
              Academic year {yearName}
              {trialNote ? <span className="text-marigold"> · {trialNote}</span> : null}
            </p>
          </div>

          <div className="ml-auto flex items-center gap-2">
            <NotificationBell unreadCount={unreadNotifications} />
            <div className="hidden text-right sm:block">
              <p className="text-[13px] font-semibold leading-tight">{userName}</p>
              <p className="text-[11.5px] leading-tight text-ink-3">{roleLabel}</p>
            </div>
            <button
              onClick={() => signOut({ redirectTo: "/login" })}
              className="rounded-md p-2 text-ink-3 hover:bg-paper-2 hover:text-ink"
              aria-label="Sign out"
              title="Sign out"
            >
              <LogOut className="size-4.5" />
            </button>
          </div>
        </div>
      </header>

      {open ? (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div className="absolute inset-0 bg-ink/40" onClick={() => setOpen(false)} />
          <div className="absolute inset-y-0 left-0 w-[280px] overflow-y-auto bg-paper shadow-pop">
            <div className="flex h-14 items-center justify-between px-4">
              <Wordmark />
              <button
                onClick={() => setOpen(false)}
                className="rounded-md p-2 text-ink-2 hover:bg-paper-2"
                aria-label="Close menu"
              >
                <X className="size-5" />
              </button>
            </div>
            <SideNav
              roles={roles}
              unreadChats={unreadChats}
              tutorOn={tutorOn}
              onNavigate={() => setOpen(false)}
            />
          </div>
        </div>
      ) : null}
    </>
  );
}
