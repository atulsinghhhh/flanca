import Link from "next/link";
import { Globe, Megaphone, MessageCircle, Wallet } from "lucide-react";
import { db } from "@/lib/db";
import { requireRole, OFFICE } from "@/lib/session";
import { getClassOptions } from "@/lib/queries/students";
import { formatMoney } from "@/lib/core/money";
import { Badge, Card, CardHead, Empty, PageHead, Stat } from "@/components/ui/primitives";
import { Compose } from "./compose";
import { Unpublish } from "./unpublish";

export const metadata = { title: "Notices — Flanca" };

const AUDIENCE_LABEL: Record<string, string> = {
  ALL: "Everyone",
  PARENTS: "Parents",
  TEACHERS: "Teachers",
  STAFF: "All staff",
  STUDENTS: "Students",
};

export default async function NoticesPage() {
  const actor = await requireRole(...OFFICE);

  const monthStart = new Date();
  monthStart.setUTCDate(1);
  monthStart.setUTCHours(0, 0, 0, 0);

  const [circulars, classes, spend, byChannel, replies] = await Promise.all([
    db.circular.findMany({
      where: { schoolId: actor.schoolId },
      orderBy: [{ publishedAt: "desc" }, { createdAt: "desc" }],
      take: 30,
    }),
    getClassOptions(actor.schoolId),
    db.messageLog.aggregate({
      where: { schoolId: actor.schoolId, createdAt: { gte: monthStart } },
      _sum: { costPaise: true },
      _count: true,
    }),
    db.messageLog.groupBy({
      by: ["channel", "status"],
      where: { schoolId: actor.schoolId, createdAt: { gte: monthStart } },
      _count: true,
      _sum: { costPaise: true },
    }),
    // A notice goes out to a class; the answers come back one at a time, privately.
    // This is the only place the school can see how many it provoked.
    db.messageThread.groupBy({
      by: ["originCircularId"],
      where: { schoolId: actor.schoolId, originCircularId: { not: null } },
      _count: true,
    }),
  ]);

  const classOptions = classes.map((c) => ({ id: c.id, name: c.name }));
  const repliesTo = new Map(replies.map((r) => [r.originCircularId, r._count]));
  const paid = byChannel.filter((c) => c.channel !== "IN_APP");

  return (
    <>
      <PageHead
        eyebrow="Today"
        title="Notices & circulars"
        sub="What the school tells parents, and exactly what it costs. In-app is free; WhatsApp and SMS are priced per message and logged."
        actions={<Compose classes={classOptions} />}
      />

      <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
        <Stat
          label="Circulars published"
          value={circulars.filter((c) => c.publishedAt).length}
          sub={`${circulars.filter((c) => c.isPublic).length} also shown publicly`}
          icon={<Megaphone className="size-4" />}
        />
        <Stat
          label="Messages this month"
          value={spend._count}
          sub="in-app, WhatsApp and SMS"
          icon={<MessageCircle className="size-4" />}
        />
        <Stat
          label="Comms spend this month"
          value={formatMoney(spend._sum.costPaise ?? 0)}
          tone={(spend._sum.costPaise ?? 0) > 0 ? "warn" : "good"}
          sub="only paid channels cost anything"
          icon={<Wallet className="size-4" />}
        />
        <Stat
          label="Paid messages queued"
          value={paid.filter((c) => c.status === "QUEUED").reduce((a, c) => a + c._count, 0)}
          sub="waiting for a provider to be configured"
        />
      </div>

      <div className="mt-5 grid items-start gap-5 lg:grid-cols-[1fr_320px]">
        <Card>
          <CardHead title="Circulars" hint="Newest first" />
          {circulars.length === 0 ? (
            <Empty
              title="No circulars yet"
              hint="Publish one and it reaches parents in the app instantly, free."
            />
          ) : (
            <ul className="divide-y divide-line">
              {circulars.map((c) => (
                <li key={c.id} className="px-5 py-3.5">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <h3 className="text-[14.5px] font-semibold">{c.title}</h3>
                    <div className="flex shrink-0 items-center gap-1.5">
                      {c.isPublic ? (
                        <Badge tone="info">
                          <Globe className="size-3" /> Public
                        </Badge>
                      ) : null}
                      <Badge tone={c.publishedAt ? "good" : "neutral"}>
                        {c.publishedAt ? "Published" : "Draft"}
                      </Badge>
                    </div>
                  </div>
                  <p className="mt-1 text-[13px] leading-snug text-ink-2">{c.body}</p>
                  <p className="mt-1.5 flex flex-wrap items-center gap-2 text-[11.5px] text-ink-3">
                    <span>
                      {AUDIENCE_LABEL[c.audience] ?? c.audience}
                      {c.publishedAt
                        ? ` · ${c.publishedAt.toLocaleDateString("en-IN", { day: "numeric", month: "long", year: "numeric" })}`
                        : ""}
                    </span>
                    {repliesTo.get(c.id) ? (
                      <Link href="/app/chat" className="font-semibold text-brand hover:text-brand-dark">
                        {repliesTo.get(c.id)} {repliesTo.get(c.id) === 1 ? "reply" : "replies"}
                      </Link>
                    ) : null}
                    {c.publishedAt ? <Unpublish circularId={c.id} /> : null}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card>
          <CardHead
            title="Message log"
            hint="This month, by channel — no surprise bill at month end"
          />
          {byChannel.length === 0 ? (
            <Empty title="Nothing sent yet" />
          ) : (
            <ul className="divide-y divide-line">
              {byChannel.map((c) => (
                <li key={`${c.channel}-${c.status}`} className="flex items-center justify-between gap-3 px-5 py-2.5">
                  <div>
                    <p className="text-[13.5px] font-medium">
                      {c.channel === "IN_APP" ? "In the app" : c.channel === "WHATSAPP" ? "WhatsApp" : c.channel}
                    </p>
                    <p className="text-[11.5px] text-ink-3">
                      {c._count} {c.status.toLowerCase()}
                    </p>
                  </div>
                  <p className="tnum text-[13.5px] font-semibold">
                    {(c._sum.costPaise ?? 0) === 0 ? (
                      <span className="text-good">Free</span>
                    ) : (
                      formatMoney(c._sum.costPaise ?? 0)
                    )}
                  </p>
                </li>
              ))}
            </ul>
          )}
          <div className="border-t border-line bg-brand-light/40 px-5 py-3">
            <p className="text-[12px] leading-snug text-brand-ink">
              Nothing is marked delivered that a provider has not accepted. Until WhatsApp or SMS keys
              are configured, paid messages sit queued and cost nothing.
            </p>
          </div>
        </Card>
      </div>
    </>
  );
}
