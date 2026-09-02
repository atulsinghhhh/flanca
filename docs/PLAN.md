# simplifiedSMS — Plan of Action

*Drafted 19 Aug 2026, from [MARKET_RESEARCH.md](./MARKET_RESEARCH.md) + the schoolOS competitive
teardowns. This is a proposal for review, not a locked plan.*

---

## 0. What this product is

**A complete school management system for a 500–1,500-student Indian private school, that one
principal can switch on in an afternoon, with no IT staff, no hardware, no implementation visit,
and no training week.**

It is not a lite version of schoolOS. It is a *whole* product for a school that will never need
schoolOS. Every role it serves, it serves completely:

| Who | What they get, completely |
|---|---|
| **Principal / owner** | Onboards the entire school and its existing records themselves. Sees collection, attendance, results and staff in one screen. Files UDISE/APAAR without dread. |
| **Teachers** | Attendance in one tap. Marks entry that feels like a spreadsheet. Report cards generated, not assembled. Never has to be a data-entry operator. |
| **Students** | Their own timetable, marks, attendance, homework, fee status, certificates. |
| **Parents** | Fee dues with an honest itemised breakdown, ₹0 extra to pay. Absence alert same morning. Results the moment they publish. In their language. |
| **Office / accounts / other staff** | Fee counter with receipts, defaulter list, TC/bonafide in one click, staff attendance and salary register. |
| **The outside world** | A public school page: admission enquiry and application, fee structure, notices, calendar, certificate verification — the layer people meet *before* they reach the school. |

That last row is the one nobody in this market does well, and schools care about it more than any
module, because it brings **admissions**.

## 1. Positioning — the one sentence

> **The school system you can switch on this afternoon. Everything a school runs on, one tap per
> task, working offline, at a price we publish.**

Four claims underneath it, each pointed at a documented market failure:

1. **"Live today, not in six weeks."** Entab takes 6+ weeks; Fedena 4–8; the cheap players 2 weeks.
   We self-provision in minutes — this is already proven code in schoolOS Command.
2. **"We move your data, and you watch us do it."** Fear of data loss is the #1 reason schools don't
   switch. Migration is the hero, with a preview-and-approve step so nothing lands silently.
3. **"One tap. No signal needed. Never lost."** Against "5 clicks to mark attendance", servers
   collapsing at 9am, and teachers re-marking attendance after the system lost it.
4. **"The price is on the website."** Nobody in the incumbent tier will show a school a number.

## 2. Pricing — undercut World B with a tier they structurally cannot follow

The real bar is **₹17,000–23,000/yr** (EduGradUP at 700–1,500 students; Pathshala ₹15k flat), already
including free migration and training. Incumbents at ₹30–80/student/month are irrelevant to this
fight.

Proposed, flat annual, no per-student maths, no module gating, no setup fee, no training fee:

| Tier | Students | Price/yr | Why |
|---|---|---|---|
| **Free forever** | up to 200 | **₹0** | Pre-primary and small primary. Costs us almost nothing and no competitor can follow: their cost structure includes a human implementation visit. This is the land move. |
| **School** | up to 750 | **₹7,500** | ~½ of EduGradUP's ₹14–17k band |
| **School+** | up to 1,500 | **₹12,000** | ~½ of EduGradUP's ₹23k; ~1/20th of Entab at this size |
| **Trust** | multi-branch / 1,500+ | quoted | Group deals, still published as a formula |

Everything is included in every tier, including the parent/teacher apps and every language. Two
honest usage add-ons, priced at near cost and clearly labelled: **WhatsApp credits** (competitors
charge ~₹0.25/msg) and **card/netbanking MDR** (UPI stays ₹0 — see below).

Guarantees that cost us nothing and kill objections: **30-day full trial with no card, your data is
yours and exports in one click, cancel any time, money-back in 30 days.**

**Margin logic:** our marginal cost per school is a Postgres schema and some compute. No sales rep,
no implementation engineer, no content library, no hardware. Free-tier schools are our distribution
channel and our reference customers — the two things we currently have none of.

**Monetisation beyond subscription (needs a founder decision, §8):** UPI direct-to-school is 0% MDR
today and the Ministry of Education is actively pushing it, so **"₹0 convenience fee"** is true and
defensible. That means we should *not* plan to skim the parent. The honest paths are the paid tiers,
WhatsApp credits, and graduation into aiLms/testWest depth later.

## 3. Scope — what's in, what's deliberately out

**In (the spine — all of it must be genuinely finished, not stubbed):**

1. **School setup** — one guided pass: board, academic year, classes/sections, subjects, fee heads,
   grading scheme. Opinionated Indian K-12 defaults so a school can accept every suggestion and be done.
2. **Students & admissions** — register of record, admission numbers, promotion/rollover, TC-out,
   bulk import from Excel/CSV with preview-and-approve.
3. **Fees** — structures, concessions, installments, invoices with **itemised head-wise breakdown**,
   counter receipts (cash/cheque/UPI), online payment, dues and defaulter lists, reminders.
4. **Attendance** — student daily/period, one tap, **offline-first**, auto parent alert; staff attendance.
5. **Exams → marks → report cards** — terms, blueprints, marks entry that behaves like a spreadsheet,
   grade rules, board-correct printable report cards, **HPC-lite** for the NEP shift, ranks and analysis.
6. **Communication** — in-app + WhatsApp/SMS: fee due, absence, marks published, circulars, holidays.
   Multi-language.
7. **Certificates** — TC, bonafide, character, fee receipt, with gap-free serial numbers.
8. **Compliance** — UDISE+ export, **APAAR coverage tracker** (per class, missing list, consent capture,
   name-mismatch retry queue), DPDP consent register with verifiable parental consent.
9. **Timetable** — simple class/teacher grid, no optimiser.
10. **Staff & payroll-lite** — staff records, attendance, leave, salary register (not statutory payroll).
11. **Principal dashboard** — collection vs target, attendance today, results, defaulters, staff present.
12. **Public school page** — enquiry and admission application, fee structure, notices, calendar,
    certificate verification.
13. **Parent / student / teacher app** — installable PWA, offline-tolerant, in their language.

**Out, on purpose:** LMS, AI tutor, question banks, online tests, transport with GPS, biometric device
integration, hostel, inventory, library (maybe — see §8), alumni, visitor management, statutory payroll.
These are either hardware-dependent, checkbox padding, or the graduation path into schoolOS.

## 4. Architecture — one product, but not a fork

**The hazard:** simplifiedSMS as a copy of schoolOS ERP means every fee bug is fixed twice, schemas
drift, and a school that outgrows it has no upgrade path. That kills both maintainability and the
expansion story.

**The stance:**

- **One Next.js app, one Postgres, ~20–25 tables.** No cross-app SSO, no event bus, no separate
  services, no per-app schemas. The complexity of schoolOS (5 apps, 103 tables) is exactly what
  makes it wrong for this customer.
- **Shared pure logic, not shared plumbing.** All business maths — fee computation, attendance
  aggregation, grading and report cards, certificate serials, UDISE/APAAR mapping — lives as pure,
  tested functions in a shared package. This is already the pattern that worked in schoolOS
  (`time-back-core.ts`, `retention-core.ts`). The app is UI + schema.
- **Structurally compatible entity names** with schoolOS ERP wherever they overlap, so "graduate to
  the full suite" is a data copy, not a rewrite. Non-negotiable — it's the expansion story.
- **Offline-first where teachers work.** Attendance and marks entry queue locally and sync; a lost
  signal must never lose a mark and must never require re-entry. This is the single most differentiating
  engineering investment in the plan.
- **Multi-tenant, we host.** Small schools have no IT. Self-hosting stays possible (AGPL) but is not
  the default path.
- **Cheap by construction** — no paid API required to run: free/local LLM if AI is used at all,
  in-app comms free with WhatsApp as a paid upgrade, UPI direct with no gateway dependency for the
  common case.

## 5. UI direction — the thing that will actually win the room

Every competitor is beatable on look alone: "dated UI", "basic UI", "heavy". The design brief:

- **Government-grade clarity, consumer-grade polish.** A clerk and a 55-year-old principal must both
  succeed without training. That means large type, obvious primary actions, no ambiguous icons, no
  dense enterprise tables where a card would do.
- **Fast and calm.** No decorative motion, no scroll-jank, no skeleton flicker. Perceived speed is a
  feature the research explicitly complains about.
- **Built for the phone in a corridor and the desktop in the office** — same product, different density.
- **Sunlight-legible, thumb-reachable** for teachers; **print-perfect** for the office (report cards,
  receipts, certificates are physical objects in an Indian school).
- **A real typographic identity** with proper Devanagari support from day one — not English UI with
  Hindi strings bolted on later.
- **One-tap benchmarks we hold ourselves to:** mark a class's attendance ≤ 1 tap per absent student;
  find any student's fee status ≤ 3 seconds; generate a class's report cards ≤ 1 action.

Design language should be its own — recognisably from the same house as thinkersKlub, but this is a
tool, not a marketing site. Distinct from generic dashboard-template look.

## 6. Build order — every slice ends in something you can show a principal

| # | Slice | Why here | Showable outcome |
|---|---|---|---|
| 0 | Foundation: app skeleton, tenancy, auth, design system, seeded realistic demo school | Everything sits on it | A logged-in, real-looking school |
| 1 | **Landing page + public school page** | You need something to show on the next visit | A URL that hooks a principal |
| 2 | Students register + **Excel/CSV import with preview** | Kills the #1 objection (data loss) | "Give me your Excel" — 800 students land in 2 minutes |
| 3 | **Fees**: structures → invoices (itemised) → counter receipt → dues/defaulters | The reason they buy | Collect a fee, print a receipt, pull a defaulter list |
| 4 | **Attendance**: one-tap, offline, auto parent alert | The daily habit + the loudest teacher pain | Mark a class with wifi off, parent gets the alert |
| 5 | **Exams → marks → report cards** (+ HPC-lite, printable) | The terminal panic | Print a board-correct report card |
| 6 | Parent/student PWA + communication (WhatsApp/SMS) | Makes parents notice the school upgraded | A parent's phone showing dues + absence alert |
| 7 | **Compliance**: UDISE export, APAAR tracker + consent, DPDP register | Urgent *this month* (30 Sep freeze) | "23 students missing APAAR — here they are" |
| 8 | Certificates + timetable | Constant office work | TC printed in one click |
| 9 | Staff, attendance, salary register | Completes "other staff" | Monthly salary register |
| 10 | Principal dashboard + reports | Ties it together | The one screen an owner opens daily |
| 11 | Onboarding wizard polish, self-serve signup, billing | Turns it into a business | A school signs itself up unattended |

Slices 1–5 are the demoable product. 1–7 is the sellable product.

## 7. Go-to-market — three wedges available right now

1. **The APAAR crunch (September 2026).** Certification freezes 30 Sep; students without APAAR block
   the school's certification. Walk in with a tracker that finds the gaps. Urgent, dated, unarguable.
2. **Teachmint refugees.** ERP shut down April 2026. "Free migration off Teachmint" is a warm list.
   *Verify the shutdown first-hand before using it publicly.*
3. **DPDP fear (Nov 2026 / May 2027).** Verifiable parental consent for under-18 data, ₹200 crore
   exposure, and almost no school is ready. We're the ones who already thought about it.

Distribution: publish the price, free forever under 200 students, self-serve signup, and the school's
own public page as an inbound surface.

## 8. Open decisions — I need your calls before building

1. **Name.** "SimplifiedSMS" reads as *text messaging* to most people, and "Simplified" undersells a
   product you're positioning as complete. In-market it also collides with "School Management System"
   generically. Worth 10 minutes now — it goes on every screen and on the landing page.
2. **Pricing** — is the free-under-200 + ₹7,500 / ₹12,000 ladder right, or do you want a single flat
   number for simplicity ("₹9,999/yr, any size") which is an even sharper story?
3. **Library — in or out?** Small schools do have libraries and it's cheap to build. It's also padding.
4. **Which is slice 1** — landing page first (you visit a school this week) or the working product
   first (so the landing page shows real screenshots)? My call: landing page first, but written to
   promise only what slices 2–5 will actually deliver.
5. **Hosting** — do we host for schools from day one (needs a domain, a Postgres, uptime discipline),
   or is it local-demo-only until the first paying school?
6. **Language scope for v1** — English + Hindi, or English + Hindi + one regional (which region are
   the schools you're visiting)?
7. **Does this replace tomorrow's investor pitch narrative, or sit under it?** My view: it strengthens
   it — "we built the full platform, went to the schools, and found the wedge" is a better story than
   the platform alone.
