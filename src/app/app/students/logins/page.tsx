import { requireRole, OFFICE, currentSchool } from "@/lib/session";
import { db } from "@/lib/db";
import { classOrderFor } from "@/lib/core/setup-core";
import { loginDomainFor } from "@/lib/core/login-core";
import { Card, CardHead, PageHead, Stat } from "@/components/ui/primitives";
import { LoginIssuer, type ClassRow } from "./login-issuer";

export const metadata = { title: "Student logins — Flanca" };

/**
 * Who in this school can sign in for themselves.
 *
 * The seed gave forty children a login on purpose — a school that switched on
 * this morning does not have an account for every parent, and the product has to
 * look right in that state. The tutor turned that into a limit: a provisioned
 * tutor account has no usable password, so a child with no Flanca login can only
 * reach the tutor through a parent's phone.
 *
 * This is the office's way to close that, one class at a time, on paper.
 */
export default async function StudentLoginsPage() {
  const actor = await requireRole(...OFFICE);
  const school = await currentSchool(actor.schoolId);
  const domain = loginDomainFor({ email: school.email, slug: school.slug });

  const classes = await db.class.findMany({
    where: { schoolId: actor.schoolId },
    select: {
      id: true,
      name: true,
      students: { where: { status: "ACTIVE" }, select: { userId: true } },
    },
  });

  const rows: ClassRow[] = classes
    .map((c) => ({
      id: c.id,
      name: c.name,
      active: c.students.length,
      withLogin: c.students.filter((s) => s.userId !== null).length,
    }))
    .sort((a, b) => classOrderFor(a.name) - classOrderFor(b.name));

  const active = rows.reduce((n, r) => n + r.active, 0);
  const withLogin = rows.reduce((n, r) => n + r.withLogin, 0);

  return (
    <>
      <PageHead
        eyebrow="Students"
        title="Student logins"
        sub={`${school.name} · a login lets a child open their own timetable, marks and — if the school has it — the tutor, with no second password`}
      />

      <div className="mb-5 grid grid-cols-2 gap-3 sm:grid-cols-3">
        <Stat label="On the roll" value={String(active)} sub="active students" />
        <Stat
          label="Can sign in"
          value={String(withLogin)}
          tone={withLogin === active ? "good" : "neutral"}
          sub={`${active - withLogin} without a login`}
        />
        <Stat label="Login domain" value={domain.deliverable ? domain.domain : "reserved"} sub={domain.domain} />
      </div>

      {!domain.deliverable ? (
        <Card className="mb-5">
          <p className="px-5 py-3.5 text-[13.5px] leading-relaxed text-ink-3">
            This school has no email address on record, so logins are being built on{" "}
            <strong className="font-semibold">{domain.domain}</strong> — a reserved domain that can
            never receive mail. That is deliberate: these are <em>identifiers a child types</em>, not
            mailboxes, and nothing in Flanca sends to them. Put the school&rsquo;s own address in
            Settings first if you would rather they read as{" "}
            <code className="text-[12.5px]">name@yourschool.edu.in</code>.
          </p>
        </Card>
      ) : null}

      <LoginIssuer rows={rows} domain={domain.domain} />

      <Card className="mt-5">
        <CardHead
          title="How the codes work"
          hint="Read this before printing four hundred slips."
        />
        <ul className="space-y-2 px-5 py-4 text-[13.5px] leading-relaxed text-ink-2">
          <li>
            <strong className="font-semibold">The code is shown once.</strong> It is hashed on the way
            into the database and never written to the audit trail, so a lost slip is a reset, not a
            lookup. Print before you leave the page.
          </li>
          <li>
            <strong className="font-semibold">The child must change it on first sign-in.</strong> A
            code that travels home in a school bag is not a password worth keeping, and the app will
            let them do nothing else until they have picked their own.
          </li>
          <li>
            <strong className="font-semibold">No ambiguous characters.</strong> No 0 or O, no 1 or l,
            no 5 or S — because &ldquo;the password does not work&rdquo; is a phone call to the office,
            times four hundred.
          </li>
          <li>
            <strong className="font-semibold">Pressing it again is safe.</strong> A child who already
            has a login is never re-issued one; only the children without get anything.
          </li>
        </ul>
      </Card>
    </>
  );
}
