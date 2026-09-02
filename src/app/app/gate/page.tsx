import Link from "next/link";
import { db } from "@/lib/db";
import { requireRole, OFFICE } from "@/lib/session";
import { Badge, Card, CardHead, Empty, PageHead, Stat } from "@/components/ui/primitives";
import { GatePassForm, SignOutButton, VisitorForm } from "./gate-forms";

export const metadata = { title: "Gate & visitors — Flanca" };

const TIME = (d: Date) => d.toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit" });

export default async function GatePage() {
  const actor = await requireRole(...OFFICE);

  const now = new Date();
  const dayStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));

  const [visitors, passes, students] = await Promise.all([
    db.visitor.findMany({
      where: { schoolId: actor.schoolId, inAt: { gte: dayStart } },
      orderBy: { inAt: "desc" },
    }),
    db.gatePass.findMany({
      where: { schoolId: actor.schoolId, issuedAt: { gte: dayStart } },
      orderBy: { issuedAt: "desc" },
    }),
    db.student.findMany({
      where: { schoolId: actor.schoolId, status: "ACTIVE" },
      orderBy: [{ class: { sequenceOrder: "asc" } }, { name: "asc" }],
      take: 400,
      select: { id: true, name: true, class: { select: { name: true } }, section: { select: { name: true } } },
    }),
  ]);

  const inside = visitors.filter((v) => !v.outAt);

  const passStudentIds = [...new Set(passes.map((p) => p.studentId).filter((id): id is string => Boolean(id)))];
  const passStudents =
    passStudentIds.length > 0
      ? await db.student.findMany({
          where: { id: { in: passStudentIds } },
          select: { id: true, name: true, class: { select: { name: true } }, section: { select: { name: true } } },
        })
      : [];
  const passStudentById = new Map(passStudents.map((s) => [s.id, s]));

  return (
    <>
      <PageHead
        eyebrow="School"
        title="Gate & visitors"
        sub="Who is in the building right now, and every early pickup with the name of the person who took the child."
      />

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <Stat label="Visitors today" value={visitors.length} sub={`${inside.length} still inside`} />
        <Stat
          label="Currently in the building"
          value={inside.length}
          tone={inside.length > 0 ? "warn" : "good"}
          sub="not yet signed out"
        />
        <Stat label="Gate passes today" value={passes.length} sub="early pickups" />
      </div>

      <div className="mt-5 grid items-start gap-5 lg:grid-cols-2">
        <div className="space-y-5">
          <Card>
            <CardHead title="Sign a visitor in" />
            <VisitorForm />
          </Card>

          <Card className="overflow-hidden">
            <CardHead title="Today's visitor log" />
            {visitors.length === 0 ? (
              <Empty title="No visitors yet today" />
            ) : (
              <ul className="divide-y divide-line">
                {visitors.map((v) => (
                  <li key={v.id} className="flex items-start justify-between gap-3 px-5 py-2.5">
                    <div className="min-w-0">
                      <p className="text-[13.5px] font-medium">{v.name}</p>
                      <p className="text-[11.5px] text-ink-3">
                        {TIME(v.inAt)}
                        {v.outAt ? ` – ${TIME(v.outAt)}` : ""}
                        {v.purpose ? ` · ${v.purpose}` : ""}
                        {v.whomToMeet ? ` · to meet ${v.whomToMeet}` : ""}
                      </p>
                    </div>
                    <div className="shrink-0 text-right">
                      {v.outAt ? (
                        <Badge tone="neutral">Left</Badge>
                      ) : (
                        <>
                          <Badge tone="warn">Inside</Badge>
                          <div className="mt-1">
                            <SignOutButton visitorId={v.id} />
                          </div>
                        </>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>

        <div className="space-y-5">
          <Card>
            <CardHead title="Early pickup" hint="Issue a gate pass" />
            <GatePassForm
              students={students.map((s) => ({
                id: s.id,
                label: `${s.name} — ${s.class?.name ?? "—"}${s.section ? ` ${s.section.name}` : ""}`,
              }))}
            />
          </Card>

          <Card className="overflow-hidden">
            <CardHead title="Gate passes today" />
            {passes.length === 0 ? (
              <Empty title="No early pickups today" />
            ) : (
              <ul className="divide-y divide-line">
                {passes.map((p) => {
                  const student = p.studentId ? passStudentById.get(p.studentId) : undefined;
                  const studentLine = student
                    ? `${student.name}${student.class ? ` · ${student.class.name}${student.section ? ` ${student.section.name}` : ""}` : ""}`
                    : null;
                  return (
                    <li key={p.id} className="px-5 py-2.5">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          {studentLine ? <p className="text-[13.5px] font-medium">{studentLine}</p> : null}
                          <p className={studentLine ? "text-[12px] text-ink-3" : "text-[13.5px] font-medium"}>
                            {p.releasedTo}
                          </p>
                          <p className="text-[11.5px] text-ink-3">
                            {p.relation ?? "—"} · {p.reason}
                          </p>
                        </div>
                        <div className="shrink-0 text-right">
                          <p className="font-mono text-[11.5px] text-ink-3">{p.passNo}</p>
                          <p className="text-[11px] text-ink-3">{TIME(p.issuedAt)}</p>
                        </div>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </Card>
        </div>
      </div>
    </>
  );
}
