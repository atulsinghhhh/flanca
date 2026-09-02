import Link from "next/link";
import type { Metadata } from "next";
import {
  Apple, ArrowRight, Award, Backpack, Beaker, Bell, BookOpen, Bus, Calculator,
  CalendarClock, Clock, CloudOff, Download, Flag, Globe, GraduationCap, IndianRupee,
  LibraryBig, Microscope, Music, Notebook, Palette, Paperclip, Pencil, PenTool, Printer,
  Ruler, School, Scissors, Shapes, ShieldCheck, Smartphone, Trophy,
} from "lucide-react";
import { auth } from "@/lib/auth";
import {
  ApaarFragment, AttendanceFragment, ImportFragment, InvoiceFragment,
} from "@/components/marketing/product-fragments";
import {
  SketchArrowCurve, SketchBell, SketchBus, SketchCap, SketchClock, SketchCoin, SketchGlobe,
  SketchPapers, SketchRegister, SketchRule, SketchSchool, SketchStamp, SketchStar,
  SketchTools,
} from "@/components/marketing/sketches";
import "./landing.css";

export const metadata: Metadata = {
  title: "Flanca — the school system you can switch on this afternoon",
  description:
    "Complete school management for Indian schools of 500–1,500 students. Admissions, fees, attendance, exams, report cards and 2026 compliance. One tap per task, works offline.",
};

const NOTES = [
  {
    who: "The office",
    tint: "var(--mark-soft)",
    tilt: "-1.6deg",
    body:
      "Admissions and enquiries, the fee counter, printed receipts with gap-free serials, and the day's cash closeout. A clerk who knows Excel needs no training.",
  },
  {
    who: "Teachers",
    tint: "var(--sky)",
    tilt: "1.4deg",
    body:
      "One tap per absent student, marks entered as a grid rather than a form, homework set from a phone in the corridor. Nothing to sync by hand.",
  },
  {
    who: "Parents",
    tint: "var(--pista)",
    tilt: "1.2deg",
    body:
      "An itemised invoice that says what each rupee is for, UPI straight to the school's account, attendance and results the same evening. No app store, no convenience fee.",
  },
  {
    who: "The principal",
    tint: "var(--rose)",
    tilt: "-1.2deg",
    body:
      "Collection against target, today's absence, and exactly who is blocking your UDISE+ certification — on one screen, before the management committee asks.",
  },
];

const INCLUDED = [
  {
    group: "students",
    items: ["Admissions and enquiries", "Student register", "Promotion and rollover", "Documents", "ID cards", "Alumni"],
  },
  {
    group: "money",
    items: ["Fee structures and concessions", "Term invoices, itemised", "Fee counter and receipts", "Dues and defaulters", "UPI direct, ₹0 to the parent", "Day book and cash closeout"],
  },
  {
    group: "attendance",
    items: ["One-tap student attendance", "Works with no signal", "Staff attendance and leave", "Monthly printable register", "Board-eligibility shortage report"],
  },
  {
    group: "academics",
    items: ["Exam terms and marks entry", "Report cards and HPC", "Ranks and result analysis", "Timetable", "Homework and lesson plans"],
  },
  {
    group: "compliance",
    items: ["APAAR tracker and consent", "Aadhaar name-mismatch check", "UDISE+ exports", "DPDP consent register", "Certificates with public verification"],
  },
  {
    group: "the rest of the school",
    items: ["Staff records and salary register", "Library", "Transport", "Hostel and mess", "Stock, assets and gate log", "Parent, teacher and student apps"],
  },
];

const FAQ = [
  {
    q: "How long does switching on actually take?",
    a: "An afternoon, if your register is already a file. Upload the Excel or CSV you keep today — headings spelled “Adm.No” and “Std”, dates in dd/mm/yyyy, a title row above them — and we read it as it is. Every row is checked and shown to you, nothing is written until you approve it, and one click undoes the whole batch. No implementation visit, no six-week rollout.",
  },
  {
    q: "Does it work when the internet doesn't?",
    a: "Attendance does, which is the one thing that cannot wait. Marks are held on the device and sync themselves when the signal returns; a mark is never lost and a class is never marked twice. The rest of the product needs a connection, and we would rather say so than claim otherwise.",
  },
  {
    q: "Do parents pay anything extra to pay us?",
    a: "No. Fees paid by UPI go straight to the school's own account, with no aggregator in between — the parent pays the invoice amount and nothing more. Some fee-collection platforms charge parents up to 2% as a convenience fee. Card payments carry the gateway's own charge, shown before anyone confirms.",
  },
  {
    q: "Is APAAR and UDISE+ genuinely handled, or just listed?",
    a: "Handled. One screen shows every student blocking your certification, diagnoses the Aadhaar name mismatches the portal silently rejects, and takes the block of IDs UDISE+ hands back as a paste. Alongside it is a DPDP consent register that records how each parent was verified — which is the part that makes the consent count.",
  },
  {
    q: "What happens to our data if we leave?",
    a: "The whole school exports to one spreadsheet, any time, free — students, fees, receipts, attendance, marks. No request form and no notice period. Our field names also stay compatible with a full ERP, so growing out of us is a data copy rather than a migration project.",
  },
];

export default async function LandingPage() {
  const session = await auth();
  const signedIn = Boolean(session?.user?.id);

  return (
    <div className="lp min-h-dvh">
      <DoodleField />

      {/* ─────────────── nav. It scrolls away, like a letterhead ─────────────── */}
      <div className="px-4 pt-4 sm:px-6">
        <nav className="nav mx-auto flex max-w-6xl items-center gap-4 py-2.5 pr-2.5 pl-4">
          <Link href="/">
            <Lockup />
          </Link>

          <div className="mono mx-auto hidden items-center gap-6 lg:flex">
            <a href="#how" className="hover:opacity-70">how it starts</a>
            <a href="#compliance" className="hover:opacity-70">compliance</a>
            <a href="#faq" className="hover:opacity-70">questions</a>
          </div>

          <div className="ml-auto flex items-center gap-2 lg:ml-0">
            <Link href="/login" className="btn-line btn-sm">
              Demo
            </Link>
            <Link href={signedIn ? "/app" : "/login"} className="btn btn-sm">
              {signedIn ? "My school" : "Log in"} <ArrowRight className="size-3.5" />
            </Link>
          </div>
        </nav>
      </div>

      {/* ─────────────── hero ─────────────── */}
      <header className="relative px-6 pt-16 pb-10 sm:pt-24">
        {/* marginalia: a saffron blot and four drawings, hanging off the page */}
        <div
          aria-hidden
          className="pointer-events-none absolute -bottom-10 -left-28 size-72 rounded-full opacity-35 blur-[2px]"
          style={{ background: "var(--mark)" }}
        />
        <SketchRegister className="pointer-events-none absolute bottom-6 left-8 hidden w-28 -rotate-12 text-[var(--ink)] opacity-30 xl:block" />
        <SketchCap className="pointer-events-none absolute top-10 left-24 hidden w-24 -rotate-6 text-[var(--ink)] opacity-25 xl:block" />
        <SketchPapers className="pointer-events-none absolute right-10 bottom-14 hidden w-36 rotate-6 text-[var(--ink)] opacity-30 xl:block" />
        <SketchBell className="pointer-events-none absolute top-14 right-28 hidden w-20 rotate-12 text-[var(--ink)] opacity-25 xl:block" />

        <div className="relative mx-auto max-w-5xl text-center">
          <p className="tag mono">
            <span className="tag-chip">
              <School className="size-3" />
            </span>
            built for Indian schools of 500 to 1,500 students
          </p>

          <h1 className="mt-8 text-[40px] sm:text-[58px] lg:text-[68px]">
            The school system you can<br className="hidden sm:block" /> switch on{" "}
            <span className="hl">this afternoon.</span>
          </h1>

          <p className="mx-auto mt-8 max-w-[600px] text-[18px] text-[var(--ink-2)] sm:text-[20px]">
            Admissions, fees, attendance, exams, report cards and the 2026 compliance you cannot
            avoid — set up by your own office, from the register you already keep.
          </p>

          <div className="mt-10 flex flex-wrap items-center justify-center gap-3">
            <Link href="/login" className="btn">
              <ArrowRight className="size-4" /> See a real school in it
            </Link>
            <a href="#how" className="btn-soft">How it works</a>
          </div>

          <p className="mono mt-5 text-[var(--ink-3)]">
            no card · nothing to install
          </p>

          <div className="mt-12 flex flex-wrap items-center justify-center gap-x-5 gap-y-2 text-[13px] text-[var(--ink-3)]">
            <span className="mono">replaces:</span>
            <span>the fee register</span>
            <span aria-hidden>·</span>
            <span>four spreadsheets</span>
            <span aria-hidden>·</span>
            <span>the attendance notebook</span>
            <span aria-hidden>·</span>
            <span>a WhatsApp group nobody reads</span>
          </div>
        </div>

        {/* the product, at the size the staff will touch it */}
        <div className="relative mx-auto mt-14 max-w-5xl">
          <div className="card p-5 sm:p-7" style={{ background: "var(--paper-2)" }}>
            <p className="mono mb-4 flex items-center gap-2 text-[var(--ink-3)]">
              <span className="inline-block size-2 rounded-full" style={{ background: "var(--rust)" }} />
              live from a working school of 847 students — not a slideshow
            </p>
            <div className="grid gap-5 sm:grid-cols-2">
              <div className="[transform:rotate(-0.6deg)]">
                <AttendanceFragment />
              </div>
              <div className="[transform:rotate(0.7deg)]">
                <InvoiceFragment />
              </div>
            </div>
          </div>
        </div>
      </header>

      <Divider />

      {/* ─────────────── how it starts: the migration, as a flow ─────────────── */}
      <section id="how" className="relative scroll-mt-12 px-6 py-14 sm:py-20">
        <SketchTools className="pointer-events-none absolute top-16 right-10 hidden w-24 rotate-12 text-[var(--ink)] opacity-25 xl:block" />

        <div className="mx-auto max-w-4xl text-center">
          <h2 className="text-[34px] sm:text-[46px]">
            Give us the register<br className="hidden sm:block" /> you already keep.
          </h2>
        </div>

        <div className="mx-auto mt-14 flex max-w-5xl flex-col items-center justify-center gap-6 sm:flex-row sm:gap-2">
          <Step
            sketch={<SketchRegister className="w-24" />}
            label="what you have"
            caption="An Excel sheet, a CSV out of your old software, a title row and headings nobody standardised."
          />
          <Connector label="you upload" />
          <Step
            sketch={<SketchPapers className="w-28" />}
            label="what we show you"
            caption="Every row read and checked — odd dates, +91 numbers, missing classes, duplicates. Nothing saved yet."
          />
          <Connector label="you approve" />
          <Step
            sketch={<SketchSchool className="w-28" />}
            label="what you get"
            caption="A running school by this evening. One click undoes the entire import if you change your mind."
          />
        </div>

        <div className="mx-auto mt-16 max-w-5xl">
          <div className="grid items-center gap-8 lg:grid-cols-[1fr_1.1fr] lg:gap-14">
            <div className="note taped" style={{ background: "var(--mark-soft)" }}>
              <h3 className="text-[24px] leading-[1.25]">
                The reason schools don&rsquo;t switch is fear of losing everything.
              </h3>
              <p className="mt-3 text-[16px]">
                So an import here is something you <em>look at</em> first. We never delete a student
                who already has fees or marks against their name, and the whole batch reverses in one
                click.
              </p>
            </div>
            <ImportFragment />
          </div>
        </div>
      </section>

      <Divider />

      {/* ─────────────── attendance ─────────────── */}
      <Feature
        badge={{ icon: <CloudOff className="size-3" />, text: "attendance" }}
        title={<>One tap per absent student. <span className="hl">Even with no signal.</span></>}
        blurb="Teachers elsewhere describe five clicks per child and a server that falls over at nine in the morning. Everyone starts present; you tap only the absentees; the marks sit on the device and sync themselves."
        tint="var(--sky)"
        cardTitle="A mark is never lost, and a class is never marked twice."
        cardBody="Marking is idempotent by design — if the signal drops mid-save, the same register is not counted again when it returns. The monthly register prints on the printer you already own, and the shortage report tells you who is at risk of board ineligibility while there is still time to fix it."
        fragment={<AttendanceFragment />}
        sketch={<SketchClock className="w-24" />}
      />

      {/* ─────────────── money ─────────────── */}
      <Feature
        badge={{ icon: <IndianRupee className="size-3" />, text: "fees" }}
        title={<>Itemised invoices, and <span className="hl">₹0 extra</span> for the parent.</>}
        blurb="Every invoice shows the head-wise breakdown, so nobody rings the office to ask what the ₹1,05,000 was for. UPI goes straight to the school's own account — no aggregator, no convenience fee."
        tint="var(--pista)"
        cardTitle="Receipts an auditor can follow."
        cardBody="Serial numbers are gap-free, money is held as integer paise and billed in whole rupees, and the day's counter closes out against the cash in the drawer. Concessions, part payments, term-wise dues and the defaulter list all fall out of the same ledger."
        fragment={<InvoiceFragment />}
        sketch={<SketchCoin className="w-24" />}
        reverse
      />

      {/* ─────────────── compliance ─────────────── */}
      <Feature
        id="compliance"
        badge={{ icon: <CalendarClock className="size-3" />, text: "compliance 2026" }}
        title={<>The two deadlines nobody is <span className="hl">tracking for you.</span></>}
        blurb="An APAAR ID is mandatory for every child from Class 1 to 12, and a single student without one blocks your school's entire UDISE+ certification — not just their own record. Separately, the DPDP Act wants verifiable parental consent before a child's data is processed, photographs included."
        tint="var(--rose)"
        cardTitle="We check the name before you waste a submission."
        cardBody="The portal rejects an Aadhaar name mismatch without telling you which part is wrong, so we diagnose it first — extra name parts, initials, transposed surnames. Then you paste the IDs UDISE+ hands back, in a block. The consent register records how each parent was verified, and certificates carry a public verification link a college can check without ringing you."
        fragment={<ApaarFragment />}
        sketch={<SketchStamp className="w-24" />}
      />

      {/* ─────────────── the blackboard: everyone in the school ─────────────── */}
      <section className="px-4 py-14 sm:px-6 sm:py-20">
        <div className="board relative mx-auto max-w-6xl overflow-hidden px-6 py-16 sm:px-14 sm:py-20">
          {/* chalk drawings on the board */}
          <SketchGlobe className="pointer-events-none absolute top-10 left-8 hidden w-24 -rotate-6 text-[var(--chalk)] opacity-25 lg:block" />
          <SketchBus className="pointer-events-none absolute right-8 bottom-10 hidden w-32 rotate-3 text-[var(--chalk)] opacity-25 lg:block" />
          <SketchStar className="pointer-events-none absolute top-16 right-16 hidden w-10 text-[var(--chalk)] opacity-30 lg:block" />

          <div className="relative mx-auto max-w-3xl text-center">
            <h2 className="text-[32px] sm:text-[44px]">
              Everyone in the school gets<br className="hidden sm:block" /> their own way in.
            </h2>
            <span aria-hidden className="mx-auto mt-2 block w-52 text-[var(--mark)]">
              <SketchRule className="h-3 w-full" strokeWidth={3} />
            </span>
          </div>

          <div className="relative mx-auto mt-14 grid max-w-4xl gap-8 sm:grid-cols-2 sm:gap-x-12 sm:gap-y-10">
            {NOTES.map((n) => (
              <div
                key={n.who}
                className="note taped"
                style={{ background: n.tint, transform: `rotate(${n.tilt})` }}
              >
                <p className="mono">{n.who.toLowerCase()}</p>
                <p className="mt-3 text-[16px] leading-[1.5]">{n.body}</p>
              </div>
            ))}
          </div>

          <p className="mono relative mt-14 text-center text-[var(--chalk)]/75">
            every module together · no per-app fee · English for now, Hindi next
          </p>
        </div>
      </section>

      <Divider />

      {/* ─────────────── what's included ─────────────── */}
      <section className="px-6 py-14 sm:py-20">
        <div className="mx-auto max-w-6xl">
          <div className="flex flex-wrap items-end justify-between gap-6">
            <h2 className="max-w-xl text-[30px] sm:text-[40px]">
              Everything a school runs on, in one place.
            </h2>
            <p className="max-w-sm text-[15px] text-[var(--ink-2)]">
              Not a starter tier. This is day one, in full.
            </p>
          </div>

          <div className="mt-12 grid gap-x-12 gap-y-10 sm:grid-cols-2 lg:grid-cols-3">
            {INCLUDED.map((col) => (
              <div key={col.group}>
                <p className="mono text-[var(--ink-3)]">{col.group}</p>
                <ul className="mt-4 space-y-2">
                  {col.items.map((i) => (
                    <li key={i} className="flex gap-2.5 text-[15px] text-[var(--ink-2)]">
                      <span
                        aria-hidden
                        className="mt-[9px] size-1.5 shrink-0 rounded-full"
                        style={{ background: "var(--mark-deep)" }}
                      />
                      {i}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>

          <p className="mt-14 max-w-2xl text-[14px] text-[var(--ink-3)]">
            What we left out on purpose: GPS bus tracking and biometric attendance, because both need
            hardware you have not bought. We import a biometric device&rsquo;s data instead.
          </p>

          <div className="mt-14 grid gap-8 border-t border-[var(--rule)] pt-10 sm:grid-cols-3">
            <Assurance
              icon={<Download className="size-4" />}
              title="Your data leaves with you"
              body="The whole school exports to one spreadsheet, any time, free. No request form, no notice period."
            />
            <Assurance
              icon={<ShieldCheck className="size-4" />}
              title="Nothing bolted on later"
              body="Every module is switched on from day one. There is no upgrade to unlock."
            />
            <Assurance
              icon={<Printer className="size-4" />}
              title="Paper still matters"
              body="Receipts, report cards, registers and transfer certificates print correctly from a cheap inkjet."
            />
          </div>
        </div>
      </section>

      {/* ─────────────── the second product ───────────────
          Deliberately modest, and deliberately last before the questions.
          Flanca stands on its own and most schools will buy only this; a
          school reading a page about fee receipts and attendance has not asked
          about a tutor yet. So it is one paragraph and a link, not a pitch —
          and it says the two are separate purchases, because they are. */}
      <section className="px-6 pb-4">
        <div className="mx-auto max-w-6xl border-t border-[var(--rule)] pt-10">
          <p className="mono text-[var(--ink-3)]">There is a second product</p>
          <h2 className="mt-3 max-w-2xl text-[24px] sm:text-[30px]">
            A tutor for the children, that the school still controls.
          </h2>
          <p className="mt-4 max-w-2xl text-[15px] leading-[1.6] text-[var(--ink-2)]">
            Flanca Tutor teaches a chapter, marks a child&rsquo;s own working line by line, and notices
            the mistake she keeps repeating. Because it reads this roster, it already knows her class
            and where her marks are weak — and what it finds comes back to her class teacher here.
            It is a separate purchase and this system does not need it — priced modestly to families,
            a fraction of an evening tuition.
          </p>
          <p className="mt-5 text-[15px]">
            <a
              href="/suite"
              className="border-b border-[var(--mark-deep)] pb-0.5 font-medium text-[var(--ink)] hover:border-[var(--ink)]"
            >
              Both products, and what the two together cost
            </a>
          </p>
        </div>
      </section>

      {/* ─────────────── questions ─────────────── */}
      <section id="faq" className="relative scroll-mt-12 px-6 pb-16 sm:pb-20">
        <SketchBell className="pointer-events-none absolute top-6 right-16 hidden w-20 rotate-6 text-[var(--ink)] opacity-25 xl:block" />

        <div className="mx-auto max-w-3xl">
          <h2 className="text-center text-[32px] sm:text-[42px]">
            Questions a principal<br className="hidden sm:block" /> actually asks.
          </h2>

          <div className="mt-12">
            {FAQ.map((f) => (
              <details key={f.q}>
                <summary>
                  <span>
                    <span className="mono mr-1.5 text-[var(--ink-3)]">Q:</span>
                    {f.q}
                  </span>
                </summary>
                <p className="pr-10 pb-6 text-[16px] leading-[1.6] text-[var(--ink-2)]">{f.a}</p>
              </details>
            ))}
          </div>
        </div>
      </section>

      {/* ─────────────── close ─────────────── */}
      <section className="px-4 pb-16 sm:px-6 sm:pb-20">
        <div
          className="mx-auto flex max-w-6xl flex-col items-center gap-8 overflow-hidden px-8 py-14 sm:flex-row sm:px-14"
          style={{ background: "var(--pista)", borderRadius: "18px" }}
        >
          <div className="max-w-xl">
            <h2 className="text-[30px] sm:text-[40px]">
              No implementation visit.<br /> No six-week rollout.
            </h2>
            <p className="mt-5 text-[17px] text-[var(--ink-2)]">
              Sign in to a working school of 847 students — fees collected, attendance marked, report
              cards printed — and click anything you like. Then bring your own register.
            </p>
            <Link href="/login" className="btn mt-8">
              <ArrowRight className="size-4" /> Open the demo school
            </Link>
          </div>
          <SketchSchool className="ml-auto hidden w-56 shrink-0 text-[var(--ink)] opacity-70 sm:block" />
        </div>
      </section>

      {/* ─────────────── footer ─────────────── */}
      <footer className="relative border-t border-[var(--rule)] px-6 py-12">
        <SketchTools className="pointer-events-none absolute -top-16 right-24 hidden w-20 -rotate-6 text-[var(--ink)] opacity-20 xl:block" />
        <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-8 gap-y-4">
          <Lockup />
          <p className="mono text-[var(--ink-3)]">
            school management for Indian schools · flanca.online
          </p>
          <div className="mono ml-auto flex items-center gap-6">
            <Link href="/verify/enter" className="hover:opacity-70">verify a certificate</Link>
            <Link href="/login" className="hover:opacity-70">log in</Link>
          </div>
        </div>

        <div className="mx-auto mt-8 flex max-w-6xl flex-wrap items-center gap-3 border-t border-[var(--rule)] pt-8">
          <p className="mono text-[var(--ink-3)]">mobile apps, coming soon</p>
          <div className="flex items-center gap-2.5">
            <StoreBadge label="App Store" />
            <StoreBadge label="Google Play" />
          </div>
        </div>
      </footer>
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────────────────────
   pieces
   ────────────────────────────────────────────────────────────────────────── */

const FIELD_ICONS = [
  BookOpen, GraduationCap, Pencil, Ruler, Backpack, Bus, Bell, Globe, Calculator, Trophy,
  Beaker, Apple, Clock, Notebook, PenTool, Paperclip, Palette, Music, Award, LibraryBig,
  School, Microscope, Shapes, Scissors, Flag,
];

/**
 * The floating classroom: a page-height scatter of small, very faint school
 * objects that gives the paper some depth without ever competing with a word of
 * copy.
 *
 * Positions come out of a seeded generator rather than Math.random, because the
 * server and the client have to agree on them or React throws a hydration
 * mismatch. Same seed, same scatter, every render.
 */
function DoodleField() {
  let seed = 20260819;
  const rnd = () => {
    seed = (seed * 1103515245 + 12345) % 2147483648;
    return seed / 2147483648;
  };

  const bits = Array.from({ length: 150 }, (_, i) => {
    const Icon = FIELD_ICONS[i % FIELD_ICONS.length];
    return {
      Icon,
      key: i,
      left: rnd() * 97,
      top: rnd() * 99,
      size: 13 + Math.round(rnd() * 18),
      rot: Math.round(-30 + rnd() * 60),
      dur: 11 + Math.round(rnd() * 11),
      delay: -Math.round(rnd() * 14),
      opacity: 0.045 + rnd() * 0.055,
    };
  });

  return (
    <div className="field" aria-hidden>
      {bits.map(({ Icon, key, left, top, size, rot, dur, delay, opacity }) => (
        <span
          key={key}
          style={
            {
              left: `${left}%`,
              top: `${top}%`,
              opacity,
              "--rot": `${rot}deg`,
              "--dur": `${dur}s`,
              "--delay": `${delay}s`,
            } as React.CSSProperties
          }
        >
          <Icon style={{ width: size, height: size }} strokeWidth={1.5} />
        </span>
      ))}
    </div>
  );
}

/** A freehand rule with a sparkle on it, between the big movements. */
function Divider() {
  return (
    <div aria-hidden className="flex items-center justify-center gap-3 py-2 text-[var(--ink-3)]">
      <SketchRule className="h-3 w-24 opacity-50" />
      <SketchStar className="w-4 opacity-60" />
      <SketchRule className="h-3 w-24 opacity-50" />
    </div>
  );
}

/**
 * The landing lockup: the app's mark redrawn as a saffron sticker. Deliberately
 * not the green square from the admin shell — on paper, at this size, the
 * sticker is what carries the brand.
 */
function Lockup() {
  return (
    <span className="flex items-center gap-2.5">
      <span
        className="flex size-9 items-center justify-center rounded-[7px] border border-[rgba(15,58,44,0.15)]"
        style={{ background: "var(--mark)" }}
      >
        <svg width="24" height="24" viewBox="7 7 18 18" fill="none" aria-hidden>
          <path d="M9 23h14" stroke="var(--ink)" strokeOpacity="0.5" strokeWidth="1.8" strokeLinecap="round" />
          <path d="M9 17.5h9" stroke="var(--ink)" strokeOpacity="0.5" strokeWidth="1.8" strokeLinecap="round" />
          <path d="M10.5 14 15 9l7 12.5" stroke="var(--ink)" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </span>
      <span className="display text-[20px]">Flanca</span>
    </span>
  );
}

function Step({
  sketch, label, caption,
}: { sketch: React.ReactNode; label: string; caption: string }) {
  return (
    <div className="max-w-[240px] text-center">
      <div className="flex h-28 items-end justify-center text-[var(--ink)] opacity-80">{sketch}</div>
      <p className="mono mt-5">{label}</p>
      <p className="mt-2 text-[14px] leading-[1.5] text-[var(--ink-2)]">{caption}</p>
    </div>
  );
}

function Connector({ label }: { label: string }) {
  return (
    <div className="shrink-0 text-center text-[var(--ink-3)]">
      <p className="mono">{label}</p>
      <SketchArrowCurve className="mx-auto mt-1 w-14 rotate-45 sm:rotate-0" />
    </div>
  );
}

/** Styled like a store badge, but honest about not being one yet — no link, no store. */
function StoreBadge({ label }: { label: string }) {
  return (
    <span
      aria-disabled
      className="flex cursor-not-allowed items-center gap-2 rounded-[7px] border border-[var(--rule)] px-3 py-1.5 text-[var(--ink-3)] opacity-70"
    >
      <Smartphone className="size-4" />
      <span className="leading-tight">
        <span className="mono block text-[9px] uppercase">coming soon</span>
        <span className="block text-[13px] font-medium">{label}</span>
      </span>
    </span>
  );
}

function Feature({
  id, badge, title, blurb, tint, cardTitle, cardBody, fragment, sketch, reverse,
}: {
  id?: string;
  badge: { icon: React.ReactNode; text: string };
  title: React.ReactNode;
  blurb: string;
  tint: string;
  cardTitle: string;
  cardBody: string;
  fragment: React.ReactNode;
  sketch?: React.ReactNode;
  reverse?: boolean;
}) {
  return (
    <section id={id} className="scroll-mt-12 px-6 py-14 sm:py-20">
      <div className="mx-auto max-w-3xl text-center">
        <p className="tag mono">
          <span className="tag-chip">{badge.icon}</span>
          {badge.text}
        </p>
        <h2 className="mt-7 text-[30px] sm:text-[44px]">{title}</h2>
        <p className="mx-auto mt-6 max-w-[600px] text-[17px] text-[var(--ink-2)]">{blurb}</p>
      </div>

      <div
        className={`mx-auto mt-14 grid max-w-5xl items-center gap-8 lg:gap-14 ${
          reverse ? "lg:grid-cols-[1.1fr_1fr]" : "lg:grid-cols-[1fr_1.1fr]"
        }`}
      >
        <div className={reverse ? "lg:order-2" : undefined}>
          <div className="note taped" style={{ background: tint }}>
            <h3 className="max-w-sm text-[22px] leading-[1.25]">{cardTitle}</h3>
            <p className="mt-3 max-w-md text-[15px] leading-[1.55]">{cardBody}</p>
            {sketch ? (
              <span
                aria-hidden
                className="absolute -right-8 -bottom-6 hidden text-[var(--ink)] opacity-40 sm:block"
              >
                {sketch}
              </span>
            ) : null}
          </div>
        </div>
        <div className={reverse ? "lg:order-1" : undefined}>{fragment}</div>
      </div>
    </section>
  );
}

function Assurance({ icon, title, body }: { icon: React.ReactNode; title: string; body: string }) {
  return (
    <div className="flex gap-3">
      <span className="mt-0.5 shrink-0 text-[var(--ink)]">{icon}</span>
      <div>
        <p className="text-[15px] font-semibold">{title}</p>
        <p className="mt-1.5 text-[14px] leading-[1.5] text-[var(--ink-2)]">{body}</p>
      </div>
    </div>
  );
}
