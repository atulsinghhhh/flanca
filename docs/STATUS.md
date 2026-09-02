# Flanca — build status (plan of record)

**Product:** complete school management system for 500–1,500-student Indian private schools.
**Domain:** flanca.online · **Local:** `pnpm dev` → http://localhost:3500 · **DB:** `flanca_dev` (Postgres 18, brew, port 5432)
**Repo root:** `~/Desktop/simplifiedSMS` (folder name predates the "Flanca" naming; product name is Flanca everywhere)

Read first: [PLAN.md](./PLAN.md) · [MARKET_RESEARCH.md](./MARKET_RESEARCH.md) · [FEATURE_MATRIX.md](./FEATURE_MATRIX.md)

**Flanca is now half of a two-product suite.** [SUITE_PLAN.md](./SUITE_PLAN.md) is the plan of record
for combining it with the AI Tutor (`~/Desktop/schoolSuite/aitutor`) and getting to a school demo;
[DECISIONS.md](./DECISIONS.md) holds the five founder decisions that plan waits on. Nothing in this
file is superseded — Flanca's own roadmap below still stands, and the suite plan's Phase 2 is
largely the browser-driving this file already asks for.

---

## Picking this up cold

**All 14 phases (0–13) are built and committed.** 23,900 lines, 50 routes, 105 tests green,
14 commits. The product works end to end against a seeded 847-student school.

To carry on:

1. `cd ~/Desktop/simplifiedSMS && pnpm dev` — if Postgres is not up: `brew services start postgresql@18`.
   If the database is missing: `createdb flanca_dev && pnpm db:push && pnpm db:seed && npx tsx prisma/add-role-logins.ts`.
2. Sign in as `principal@nalandapublic.edu.in` / `flanca123` and click around — it is a real school.
3. Pick the top item from **What's next** below. Work it, drive it in a real browser, update this
   file's log, and commit. One commit per chunk of work, message explaining WHY not just what.

Founder decisions already locked (do not re-litigate): the name is **Flanca**; pricing is
₹0 under 200 students / ₹7,500 to 750 / ₹12,000 to 1,500, flat and annual; **English only** for v1;
library module is **in**; local demo first, hosting later; and the product is deliberately
feature-maximal — "give more than the competition by a huge margin, don't cut features".

## Commands

```bash
pnpm dev            # dev server on :3500
pnpm test           # vitest — pure logic cores
pnpm tsc            # typecheck
pnpm db:seed        # full 3-pass demo seed (Nalanda Public School, 847 students)
pnpm db:push        # push schema changes
```

Demo logins (password `flanca123`): `principal@nalandapublic.edu.in` · `office@nalandapublic.edu.in`
· `accounts@nalandapublic.edu.in` · `priya.menon@nalandapublic.edu.in` (teacher) · `library@nalandapublic.edu.in`
· `ashok.bhatia.1314@parent.nalandapublic.edu.in` (parent) · `kabir.bhatia.1314@nalandapublic.edu.in` (student)

Parent/student logins are created by `npx tsx prisma/add-role-logins.ts` for a 40-student slice —
deliberately a slice, because a school that has just switched on does not have a login for every parent.

## Non-negotiable rules

1. **One app, one database.** No cross-app SSO, no event bus, no microservices.
2. **All business maths lives in `src/lib/core/*` as pure tested functions.** UI never computes money or grades.
3. **Entity/field names stay compatible with schoolOS ERP** (`~/Desktop/schoolOs/erp/prisma/schema.prisma`) so graduating a school is a data copy.
4. **Money is always integer paise**, billed in whole rupees (`toRupee`).
5. **Every write is audited** via `audit()` in `src/lib/session.ts`.
6. **Speed contract:** ≤1 tap per absent student · any student's fee status in ≤3s · a class's report cards in 1 action.
7. **No fake data in the UI.** An empty state says so honestly.
8. English only in v1; keep strings i18n-ready.

## Phases

| # | Phase | Status |
|---|---|---|
| 0 | Foundation — schema (76 tables), 6 logic cores + 81 tests, design system, auth, 3-pass demo seed, app shell, Overview dashboard | ✅ done |
| 1 | Students — roster, search, profile, bulk Excel/CSV import with preview-approve-undo | ✅ done |
| 2 | Fees — structures, invoices, fee counter, receipts (print), dues + defaulters, reminders, UPI | ✅ done |
| 3 | Attendance — one-tap offline marking, registers, shortage/eligibility, staff attendance | ✅ done |
| 4 | Exams — terms, marks-entry grid, grading, report cards + HPC, print, ranks | ✅ done |
| 5 | Compliance — APAAR command centre, DPDP consent register, UDISE+ exports | ✅ done |
| 6 | Certificates — TC/bonafide/character, serials, public verification | ✅ done |
| 7 | Communication — circulars, notifications, calendar, WhatsApp/SMS log | ✅ done |
| 8 | Staff & payroll — records, attendance, leave, salary register, tasks, CPD | ✅ done |
| 9 | Facilities — library, transport, hostel, stock, assets, gate/visitors | ✅ done |
| 10 | Role surfaces — teacher, parent, student, accountant, librarian home screens | ✅ done |
| 11 | Public front door — school page, enquiry, application + tracking, verification | ✅ done |
| 12 | Timetable, homework, lesson plans, settings, audit trail, full export | ✅ done |
| 13 | Landing page (flanca.online) — pricing published, migration as hero | ✅ done |
| 14 | In-app chat, phase 1 — parent ↔ class teacher, permissions in a tested core | ✅ done |
| 14b | Chat phase 2 — the rest of the role matrix, and entry points where the work is | ✅ done |
| 14c | Chat phase 3 — audited office oversight, and participants told it exists | ✅ done |
| 14d | Chat phase 4 — broadcast out, replies back one-to-one | ✅ done |
| 14e | Chat phase 5 — lifecycle: closing, reopening, and a child who has left | ✅ done |
| 14f | Chat phase 6 — web push, the PWA, and per-device notification consent | ✅ done |
| 15 | Add & correct a student by hand — the roster's own button finally goes somewhere | ✅ done |
| 16 | Editable setup, part 1 — classes, sections and who the class teacher is | ✅ done |
| 17 | Editable setup, part 2 — subjects per class, and who teaches them | ✅ done |
| 18 | The school's half of the tutor seam — office roster page, class-teacher panel, parent panel, one-click entry | ✅ done |
| 19 | Student logins at scale — printable slips, forced first change, reset one child | ✅ done |
| 20 | Deployment gates — preflight at boot and as a command, `/api/health`, verified restore | ✅ done |

## What's next

Ordered, and corrected on 24 Aug — several items below had been done and one was
obsolete, which is worse than either.

**A — Make it demonstrable to a real school (highest value)**
1. ~~**Editable setup screens.**~~ **Done.** Classes/sections (16), subjects (17), the academic year
   and its terms, staff, fee heads and structures, exams, timetable, concessions, transport, hostel
   and stock are all editable in-app. `/app/setup` is the checklist across them, and a blocked step
   says what it is waiting for. A school that signs up today *can* configure itself without the
   import.
2. **Onboarding wizard.** Still open, and now the only item in group A. The "switch on this
   afternoon" promise needs a first-run flow: school details → board/classes → fee heads → import
   students → done, with opinionated Indian K-12 defaults so a clerk can accept every suggestion.
   `/app/setup` is the checklist; this is the guided path through it.
3. ~~Add/edit a student by hand.~~ **Done** (phase 15) — `/app/students/new` and `/app/students/[id]/edit`,
   sharing one form and one validator with the importer.

**B — Close the loops that exist**
4. Fee structure editing + raising the next term's invoices in one action (Term 3/4 are not raised
   in the seed on purpose). *Editing is done; raising the next term in one action is not.*
5. Promotion / year rollover — move a class up, carry balances, archive leavers. **This is now the
   biggest gap in the product**: a school that switches on in March needs it, and nothing else here
   is as close to unavoidable.
6. Homework submission marking, and the teacher's "collect and grade" flow.
7. Report-card remarks in bulk, and the HPC entry screen (the model + consolidation logic exist,
   there is no UI to enter HPC observations).

**C — Real deployment**
8. Hosting: point flanca.online somewhere, managed Postgres, backups, and a real `AUTH_SECRET`.
   **Everything except the accounts themselves is now ready**: `pnpm preflight` refuses a deploy on a
   placeholder secret, a localhost database, a pooled migration URL or plain http; `/api/health`
   answers with the database touched and the migration count; `pnpm verify-restore` proves a backup
   by restoring it and comparing every table. What is left is provisioning the accounts and pointing
   DNS — see `../../docs/DEPLOY_FREE.md`, which now carries the gates.
9. ~~WhatsApp BSP + SMS keys~~ — **superseded.** The school's channel is now in-app chat
   (phase 14). Web push replaces WhatsApp as the way a parent learns a message arrived; that is
   chat phase 6. `MessageLog` stays as the cost ledger if a school ever buys SMS for an emergency.
10. ~~Razorpay/UPI settlement webhook~~ — **superseded, and worth saying why.** There is no webhook to
    receive: the UPI rail here is a direct `upi://pay` intent to the school's own VPA, with no
    aggregator in the middle, which is exactly what makes the ₹0 convenience fee true. Adding Razorpay
    would reintroduce MDR and a convenience fee — the market's loudest complaint, and the thing this
    product sells against. `PaymentOrder` exists in the schema and is used by nothing.
    **The real gap is reconciliation, not confirmation**: a parent pays direct, the money is in the
    school's bank, and a clerk records it at the fee counter with the reference. That works today. What
    would help a school of 850 is a parent-submitted reference appearing in the office as "unconfirmed
    UPI payments to check against the bank statement", confirmed in one tap. Still zero aggregator,
    zero MDR. That is the item; it is not a webhook.

**D — Deferred on purpose**
- Multi-language (Hindi first). Architecture is i18n-ready; no strings extracted yet.
- GPS bus tracking and biometric attendance — both need hardware the school has not bought.
- Online exams/question banks — that is schoolOS testWest, the graduation path.

## Where things live

```
src/lib/core/*          pure, tested business logic — money, fees, grading, attendance,
                        apaar, import, certificate, payroll, library, consent
src/lib/queries/*       read models (one file per area)
src/app/app/*           the authenticated product; actions.ts per area holds the writes
src/app/s/[slug]/*      the school's PUBLIC page — its own design system in src/app/s/public.css
src/app/verify/*        public certificate verification
src/app/page.tsx        Flanca's landing page
src/components/print/*  receipt, report card, certificate — print-perfect sheets
prisma/seed*.ts         3-pass demo seed + add-role-logins.ts + one-off repair scripts
```

Two design systems, deliberately separate: the app is **"ledger & slate"** (warm paper, institutional
green `--color-brand`, tabular numerals, real print stylesheet) defined in `src/app/globals.css`; the
school's public page is **"the gate board"** (bottle green enamel masthead, gold hairlines, Newsreader
display) scoped to `.school-page` so the two never collide.

## Log

- **2026-08-24** The seam gets a school side, and three things that were true on paper became true in
  the product.

  **The tutor integration had a client and no callers.** `src/lib/tutor/client.ts` was well built,
  tested, and imported by nothing in `src/app` — the tutor's side of the seam was finished and there
  was no button in Flanca that called any of it. Now there are four surfaces, one per person with a
  reason to look: `/app/tutor` for the office (seats, a class-by-class count, preview-then-approve on
  the roster push), a class teacher's own section on her home page in the order the tutor sent it, a
  parent's own child and nothing else, and a student's door with no numbers on it. Driven live against
  the running tutor: 78 Class 7 children provisioned, the second press reading *0 new, 77 kept up to
  date*, one transferred child withdrawn, and a Class 4 child clicking through to the tutor's own
  dashboard signed in with no second password.

  Two rules in that work are load-bearing and easy to undo by accident. **Flanca never sends a child's
  email address** — it holds `guardianEmail`, which is a parent's and routinely shared between
  siblings, and the tutor keys identity on email, so sending it would put a child's account behind a
  parent's mailbox and collide the second sibling against a unique index *inside the roster
  transaction*, failing the upload for the whole class. And **a failed read blocks the push**, because
  the withdrawal rule needs to know who the tutor currently holds and an empty answer is
  indistinguishable from "everybody has left".

  **Student logins at scale.** Forty of 857 children could sign in, which was a deliberate choice and
  became a limit the day the tutor arrived: a provisioned tutor account has no usable password, so a
  child with no Flanca login could only get in through a parent's phone. `/app/students/logins` issues
  a class their logins on printable slips, never re-issues to a child who already has one, and holds
  the account at a password screen until the child has replaced the code — checked in `requireActor`,
  so server actions are gated too and not only pages. The codes avoid every character a child can copy
  wrong off a slip, and they exist only in the response that created them.

  **Deployment stopped being a fumble.** `pnpm preflight` runs the same checks the server runs at
  boot — `instrumentation.ts` throws on a fatal finding in production — and refuses a placeholder
  `AUTH_SECRET`, a production app pointed at localhost, a pooled `DIRECT_DATABASE_URL`, plain http, or
  two of the three `TUTOR_*` variables. Every one of those boots cleanly today, which is the point.
  `/api/health` touches the database rather than reporting that the process is up, and reports the
  migration count and whether there is a current academic year. `pnpm verify-restore` dumps, restores
  into a scratch database and compares every table plus the fee total: **81 tables, 54,714 rows,
  ₹1,56,84,922, identical.** That is the rehearsal behind "what happens to my data if you disappear".

  **And the import round-trip was finally driven through the UI**, twice, on the messy sample — the
  Phase 4 exit criterion that had been deferred to the dry run. 857/13/23 before, 863/14/25 after
  approving, 857/13/23 after undo, with the Class 12 the import invented removed. Written up with the
  rest in `../../docs/INTEGRITY_CHECKLIST.md`, which is the dated pass of all five integrity
  checkpoints.

  Corrected in this file at the same time: the **What's next** list said the setup screens and the
  academic year were not editable when they have been for days, and listed a Razorpay settlement
  webhook that should never be built — there is no webhook on a direct-UPI rail, and adding an
  aggregator would reintroduce the convenience fee this product sells against. The honest item there
  is reconciliation, and it is written down as that.

  515 tests, typecheck and build clean.

- **2026-08-20** The suite, and the first thing that stood in its way. Flanca and the AI Tutor
  (`~/Desktop/schoolSuite/aitutor`) are being combined, and the research pass behind that is in
  [SUITE_PLAN.md](./SUITE_PLAN.md) — the short version is that MoE guidelines bar coaching centres
  from enrolling anyone under 16, which means for Class 3–10, the majority of any school's roll, the
  formal coaching sector legally cannot serve the child. A school that supplies the evening teaching
  itself is occupying ground the regulator cleared, not making a marketing claim. And because Flanca
  already raises term invoices and takes UPI direct to the school at zero convenience fee, the tutor
  can be a **fee head** rather than a subscription: no per-parent Razorpay, no card declines, no
  monthly churn. Billing annually through an institution beats fighting a parent's credit card every
  month, and no B2C tutor in India can do it.

  Five decisions that plan cannot proceed without are in [DECISIONS.md](./DECISIONS.md), with
  recommendations. Two are genuinely dangerous rather than merely open: DPDP, because the tutor's
  core competence is per-child behavioural profiling and the Act prohibits exactly that for children
  with penalties to ₹200 crore — Flanca's existing consent register is the asset that makes the
  lawful reading available, and the opinion has the longest lead time of anything in the plan; and
  the tutor's ownership, since 69 of its 80 commits belong to somebody else.

  **Then the plan's Phase 1 hit a wall on its first item, and it was this repo's fault as much as
  the tutor's: neither product could create a production database.** Flanca had no
  `prisma/migrations` directory at all — every schema change since Phase 0 went in by `db push`, which
  is right for a schema being reshaped daily and useless the day a real deployment needs
  `migrate deploy`, because there was nothing to deploy. It is now baselined: one `0_init` migration
  generated from the schema, verified by applying it to an empty database and diffing the result
  against `schema.prisma` — no difference, 80 tables — with `flanca_dev` marked as already having it
  so dev and a fresh deploy agree. **From here schema changes go through `pnpm db:migrate`, not
  `db:push`,** or the file starts lying again.

  The tutor's was worse and more interesting. Its history was not merely incomplete at 4 of 47 tables
  — the third migration could not be applied on top of the first two at all (P3018: it altered a
  `users.elective` column that no migration had ever created; that column also arrived by `db push`).
  A history that cannot replay cannot be repaired into a faithful one, so it was squashed to a
  verified baseline and the old migrations archived with the evidence rather than deleted. Its
  `prisma.config.ts` had no `shadowDatabaseUrl`, which is why `migrate dev` had never been runnable
  there — a large part of how the drift happened in the first place.

  Both products now build for production (`next build` clean, `vite build` clean) and both create
  their database from scratch. Also fixed: `.env.example`'s `AUTH_SECRET=""change-me"` had a stray
  quote that would have carried into somebody's first deployment.

  Still true, and unchanged by today: neither product is deployed, and the tutor's per-active-student
  cost has never been measured against a paid LLM key. No price goes in front of a school before it
  has been.

- **2026-08-20** `/app/setup` — what a school still has to do. Built **last**, on purpose: a checklist is
  only worth anything if every step it points at can actually be done, and at the start of today a school
  could not create an academic year, a term, a member of staff, an exam, a timetable period, a
  concession, a bus route, a hostel room or a store item. It would have been a list of dead ends with
  ticks beside the two things the seed happened to fill in.

  The order is dependency, not decoration, and a blocked step says **what it is waiting for** rather than
  sitting there grey: fees cannot be priced before there are classes, terms hang off a class's fee
  structure in the schema so they cannot exist before a class has fees, and invoices need both terms and
  children. "Next" skips anything blocked — telling somebody to raise invoices before they have terms is
  worse than saying nothing. Class teachers and timetables are counted *against sections* rather than
  declaring victory at one, and the timetable and the first exam cycle are marked as things a school can
  open without.

  Every number is counted from the school's own data, so a step cannot be ticked while the thing it
  describes is missing — "school details filled in" means the four fields that print on a receipt, not
  merely that a School row exists. Verified without signing in: the state computed from the live demo
  school is identical to the `finished` fixture in the test, which asserts all thirteen steps done and 11
  of 11 required.

  13 tests, 428 in all.

  **Where the app now stands.** Everything on the list I gave after the year slice is built: exams,
  timetable editing, homework, concessions and the late fee, transport, hostel, stock, and the checklist.
  A school signing up on Monday can go from an empty database to raised invoices without anybody touching
  Postgres. What has *not* happened is browser driving for any of it — the demo rebuild invalidated my
  session and I cannot type a password into a login field, so exams, timetable, homework, concessions,
  transport, hostel, stock and setup are verified at the core (155 new tests today) and by typecheck,
  and every route answers 307 to an unauthenticated request rather than 500. That is the honest state,
  and driving them is the first thing to do once somebody signs in.
- **2026-08-20** The buses, the hostel and the store cupboard. All three screens showed what the seed
  had put there and could change none of it, and all three are the same mistake in different clothing: a
  bus with 40 seats and 44 children on it, a room for two with three beds allotted, and a cupboard
  issuing chalk it does not have. So they share one core file, and the rules are about not promising
  more than exists.

  **Transport.** Routes, stops, and what each stop costs a month — which is the number that lands on a
  parent's invoice as the Transport line, so changing it says how many families it affects. `canBoard`
  refuses a full bus with the numbers ("full — 40 of 40 seats") and, deliberately, allows boarding when
  no capacity is recorded rather than inventing one. Cutting a route's seat count below the children
  already on it is refused, because that is exactly the state `canBoard` exists to prevent.

  **Hostel.** Rooms, beds, wardens. A room cannot be shrunk below the children sleeping in it, and
  `canAllot` refuses a girl a bed in the boys' wing — but only when both facts are recorded, because
  guessing a child's wing from a missing gender field is worse than not checking. A room anybody has
  ever stayed in keeps its record.

  **Stock.** The act that matters is not creating an item, it is receiving a delivery and issuing to a
  class every day and having the number still be true on Friday. So every movement writes an
  `InventoryTxn` *and* applies it to the quantity in one transaction — a quantity without the movement
  that caused it is a number nobody can check. `applyStockTxn` refuses to issue what is not there and
  says what to do instead ("There are only 10 left. Count the shelf and adjust it if the register is
  wrong"), an ADJUST may set any non-negative number because that is what a stock count is, and an
  ADJUST without a reason is refused — it is the one movement that can make stock appear or vanish. Even
  an opening balance gets a movement row, so the register explains every unit on the shelf.

  33 new tests, 415 in all.
- **2026-08-20** Three more things a school could not do, all of them things it does in its first week.

  **Exams.** Marks could be entered and report cards generated, but nothing created the exam they
  belonged to. A cycle now covers every class at once and papers are scheduled a class at a time, one
  per subject, dated one a day and skipping Sundays. Three rules in `exam-core` earn their place by what
  they prevent: a split that does not add up (80 written + 30 internal on a paper out of 100 lets a
  child score 110%), lowering a paper's total once marks are in (78 out of 80 does not become 78 out of
  50), and weightages that do not total 100% — the final report card is a weighted average, so 40+40+40
  quietly changes what every child's year-end percentage means.

  **The timetable is editable.** One period at a time, with teachers who are busy elsewhere shown as
  busy *in the list* — naming the section they are in — rather than being offered and then refused; and
  a whole week at once, using the scheduler written for the seed, which reads every other section's
  periods first so a rebuilt week never takes a teacher who is already somewhere else. What it cannot
  place without a clash it leaves free, and says so.

  **Homework.** The one thing a teacher does every day. Reach comes from `getChatPerson` rather than
  being re-derived, because it already navigates the two id spaces correctly and already knows to ignore
  `StaffSubject`. The due date defaults to tomorrow, or Monday when tomorrow is a Sunday; a Sunday due
  date is queried rather than refused; homework somebody has handed in cannot be deleted. And the page
  derived "today" from a UTC midnight, so for five and a half hours every night "due from today"
  counted yesterday's homework — the same bug attendance had, now on `schoolToday()`.

  **Concessions and the late fee**, which are the two halves of what a family actually owes either side
  of the fee, and both were seed-only. A school can now create a concession type (percentage or fixed
  amount — never both, because `buildInvoice` applies percentages first and then spends fixed amounts
  against what is left, so a type carrying both is two concessions wearing one name), say which heads it
  comes off, grant one to a child from the child's own page, and approve it. **Approval is a separate
  act on purpose**: `gatherTermBilling` already refuses to apply an unapproved concession, so a clerk
  can record what a family asked for without it changing an invoice until somebody senior agrees — and
  recording is a money role while approving and revoking are the office. Taking one away demands a
  reason, because the family will ask.

  The fine policy screen shows what the rule would actually charge on a real ₹13,700 term fee at 7, 30,
  90 and 365 days late, computed by `fineAfterDays` — which has a test asserting it agrees with
  `lateFineFor`, the function the counter uses, so the preview cannot drift from the charge. An uncapped
  daily charge is warned about (it grows for as long as an invoice is forgotten), a cap below the flat
  charge is refused (the flat charge could never apply in full), and a policy that charges nothing says
  so plainly rather than looking configured.

  382 tests. **None of this is driven in the browser yet** — the demo rebuild invalidated my session and
  I cannot type a password into a login field, so exams, timetable editing, homework and concessions are
  verified at the core and by typecheck. That is the honest state of it, and driving them is the first
  thing to do once somebody signs in.
- **2026-08-20** A school can set up its own exams. Marks could be entered and report cards generated,
  but nothing in the product created the exam they belonged to — the seed made every paper, so a
  school's first unit test had nowhere to go.

  The shape follows what the database already does rather than fighting it: an exam cycle as a school
  says it — Unit Test 1 — is one `ExamTerm` row *per class*, which is why `getExamTerms` groups them
  back by name into one row. So creating a cycle writes a row for each class, and everything works on
  the cycle as a whole. Papers are scheduled a class at a time, because that is where the subjects
  differ, and `schedulePapers` does a whole class in one go — one paper per subject, dated one a day
  from a start date, **skipping Sundays**, co-scholastic subjects left out because they are graded
  rather than marked out of a total. Thirteen classes times seven subjects is not something anybody
  should type.

  Three rules in `exam-core` that exist because of what they prevent. **A split that does not add up**
  is refused: 80 written plus 30 internal on a paper out of 100 lets a child score 110%. **Lowering a
  paper's total after marks are in** is refused with the count — 78 out of 80 does not become 78 out of
  50. And **weightages that do not total 100%** are warned about, because the final report card is a
  weighted average (`weightedFinalBp`), so 40+40+40 quietly changes what every child's year-end
  percentage means; the warning names the total and, when short, says how much belongs to a cycle that
  does not exist yet. Deleting is guarded the usual way: a cycle with marks or report cards against it
  stays, and says how many.

  26 tests, 336 in all. **Not yet driven in the browser**: rebuilding the demo school invalidated my
  session and I cannot type a password into a login field, so this slice is verified at the core and by
  typecheck only. The UI driving is the first thing to do once somebody signs in.
- **2026-08-20** A school can add its own staff, and the demo school was rebuilt from a seed that no
  longer produces impossible data.

  **Staff, with logins.** The second hard blocker after the year: a school could not add a teacher, a
  clerk or a principal, so nobody could mark a register, enter a mark, take a fee or answer a parent.
  `/app/staff/new` now creates the person *and* their account, and hands the office a first password
  once — groups of four from an alphabet with no 0/O/1/I/L in it, because it gets read down a phone
  line. It is stored only as a bcrypt hash, it never reaches the audit trail (the roles do, because
  those are the consequential part), and `/app/settings` gained a card so the person it belongs to can
  change it — otherwise every password in the school stays known to whoever typed it in. Employee ids
  continue the school's own series (NPS-001 → NPS-134, keeping prefix and padding). One user may hold
  roles at two schools and `User.email` is unique across all of them, so an email already in use is
  usually somebody joining a second school: that case adds them here and leaves their password alone.
  Marking somebody as left takes their roles with them — nothing else in this product revokes a role
  when `isActive` goes false, so a departed principal would otherwise keep reading every conversation
  in the school — and it is refused while they still hold a section ("the parents in them have no other
  line to the school") or still have periods on the timetable. Verified against the stored hash rather
  than by signing in: the issued password matches, a wrong one does not, and the secret appears nowhere
  in the audit row.

  **The timetable was fiction.** Chasing a "0 periods a week" on a senior teacher's page: the seed
  chose the subject for a period with one round-robin and the teacher with a second, independent one,
  so **986 of 1,012 periods were taken by somebody not assigned to that subject** — the music teacher
  down for Class 9 maths. Making the teacher follow the subject produced 508 periods with one teacher
  wanted in two classrooms at once. Arithmetic cannot fix that, so `timetable-core.ts` schedules:
  walk the slots, put in each one a subject whose teacher is actually free, spread the week, cap a
  teacher at 30 periods, and report what could not be placed rather than putting anybody in two rooms.
  14 tests, including the exact case that broke the demo. Then the arithmetic underneath: 23 sections ×
  44 periods is 1,012 periods a week, which needs about 34 teachers, and the school had 24. The seed
  now has 38 — which is also the pupil-teacher ratio a CBSE school of 857 children actually runs at.

  **Four more seed bugs, all found by writing down what cannot be true and checking.** Receipts were
  numbered in student order while dated by payment date, so receipt 900 could be dated before receipt
  300 — a day book whose numbers and dates disagree is the first thing an auditor picks up; payments
  are now sorted by date before receipts are issued. The library lent copies it did not own (six of a
  four-copy title) because the seed issued 90 books blind, where `canIssue` refuses exactly that in the
  app. Every re-seed left the parent logins behind, because the cleanup matched
  `@nalandapublic.edu.in` and a parent's address is `…@parent.nalandapublic.edu.in` — which does not
  contain that string at all, the "@" being before "parent" — so the next run died on a duplicate
  email. And staff gender was derived from position in the name list, alternating, which recorded Ravi
  Shankar Mishra as female and Anjali Deshpande as male; it showed, because the demo's first chat
  conversation addressed a male class teacher as "ma'am" and called a girl "him". Gender is written
  beside the name now, and the seeded conversations take the honorific and the pronouns from the
  records. Two staff names also collided with teachers (the accountant was another Neelam Pandey), which
  is what made staff pickers ambiguous.

  **`pnpm db:seed` now builds the whole demo school in one command** — all six passes — and
  `prisma/repair-demo.ts` run straight afterwards reports *nothing to do* on every check, which is the
  real proof the seed is fixed rather than patched. The rebuilt school: 857 children, 42 staff, 23
  sections, 1,012 consistent periods, 1,714 invoices, 1,428 gap-free receipts in date order, 35,960
  attendance marks, 782 report cards, 40 parent and 40 student logins, three conversations. Every
  impossible-state check is zero: no future-dated returns, payments or attendance, no child without a
  section, no gap in either serial series, no receipt out of date order, no period taught by the wrong
  teacher, no teacher double-booked, no shelf count wrong, no invoice paid more than it owed, no status
  disagreeing with its paid amount. 310 tests green.

  The rebuild also swept away every artefact of my own testing, which is what it was for. One
  consequence: it invalidated the browser session (the app noticed and sent me to `/login?e=stale`,
  which is correct behaviour I had not seen before), and I cannot type a password into a login field, so
  the UI driving for this slice was done before the rebuild and the post-rebuild checks were made
  against the database and the unauthenticated surface.
- **2026-08-20** A school can create its own academic year — and its terms. Setting out to build an
  onboarding checklist, the first thing I did was ask what a school signing up on Monday could actually
  do, and the answer was very little: **nothing in the app had ever created an academic year, a term, an
  exam, an exam term, a timetable period, a concession type, a late-fee policy, or a member of staff.**
  The seed was the only thing that had. A checklist pointing at screens that cannot do the job is
  theatre, so the capabilities come first and the checklist after.

  The year is the one everything hangs off — fee structures, invoices, exam terms, report cards and
  enrolments all belong to one — so it went first. `/app/settings/year` creates years, switches which is
  current (exactly one, in a transaction, because two would make every "this year" query pick one at
  random), and owns the year's terms. `tidyYearName` takes "2026-2027", "26-27" or "2026" and gives back
  "2026-27"; typing the year fills in 1 April to 31 March, as they type rather than on blur — I could not
  verify a blur handler under automation last time and removed it, and filling in as they type is better
  anyway because the dates are there to correct before anyone reaches for them.

  Terms are the second half. A due date could already be edited but a term could not be *created*, so a
  new school's fee structure had nothing to divide into and the invoices screen had nothing to raise.
  `suggestTerms` splits a year into 2, 3, 4, 6 or 12 and names each after the months it covers — "Term 1
  (Apr–Jun)", due on the 15th of its first month — which reproduces the seeded school's labels exactly,
  so nothing renames itself. A school picks a number instead of typing twelve fields, then edits any of
  them. In the schema a term hangs off a *class's* fee structure, not the year, so terms can only exist
  once a class is priced; that ordering is real and the screen explains it instead of failing quietly.
  The duplicate term editor I had put on the fee structure screen is gone — one home for terms, and the
  fees screen links to it.

  Two things the driving found. **A year created by mistake could never be deleted.** `canDeleteYear`
  refused while a fee structure existed, and nothing in the product removes a fee structure — so the
  year was stuck for ever. The rule now draws the line where it belongs: an invoice or an enrolment is
  history and stops the delete; a fee structure or an exam term is configuration somebody typed, goes
  with the year, and is named out loud in a confirmation first ("This also removes the fee structure for
  1 class. Nothing was billed from any of it."). **A stale refusal outlived its year** — the error about
  Term 1's 849 invoices was still on screen after switching to a year that has no terms, so the terms
  card is keyed on the year and a different year starts clean.

  Also: the fee grid showed a class's full annual fee in the "per term" column when the year had no
  terms — reading as ₹26,000 a term when the truth was ₹26,000 a year. It shows a dash now.

  Driven end to end as a new school would: created 2027-28 from "2027-2028", made it current, confirmed
  every page in the app survives a current year with nothing in it, priced Nursery at ₹26,000, split the
  year into four terms, and watched `/app/fees/raise` offer 24 invoices at ₹1,57,900 — which is
  ₹6,500 a term times 24, plus five bus fares, less an RTE and two staff-ward concessions, to the rupee.
  Then put the demo school back exactly as it was: 13 structures, 72 items, 52 installments, 1,696
  invoices, one current year. 268 tests green.
- **2026-08-20** A sweep for things a school would notice, before building anything new. Crawled every
  route — 39 static, 12 with real ids, and each `[id]` route again with a malformed id — and all of them
  behaved: 200s, no error screens, and a nonsense id lands on "That record is not here" rather than
  "something broke". One apparent double-render on the new invoices screen turned out to be Next's
  hidden streaming buffer (`div#S:0`), not a real duplicate; the visible `main` has one copy. Worth
  remembering when checking the DOM: scope queries to `main`.

  Then a sweep of the demo data itself for states a real school cannot be in, and three were:

  **Books returned in the future.** Thirteen loans came back next week, because the seed picked a
  return date up to 22 days after the issue date without clamping it to today. Fixed at the source, and
  the existing rows brought back: twelve re-dated into the past, one issued too recently to have come
  back at all, so it is simply still out.

  **Twenty-two holes in the receipt series** — 1,396 receipts spread across a range of 1,418, because an
  earlier session's test payments were deleted and deleting a payment takes its receipt with it. The
  seed cannot produce a gap on its own. This one is not cosmetic: receipt continuity is what a school
  gets audited on, and the product claims it in so many words. Renumbered in issue order to 1–1396 with
  the counter at 1397. The frozen snapshot on each receipt holds amounts, not the number, so a reprint
  still shows what the parent was handed.

  **A book with six copies out of four.** `canIssue` refuses to lend a book with nothing on the shelf,
  so the app could not have done this — the seed lent copies it had not counted. `availableCopies` is a
  counter kept by hand, so it is now recomputed for every book from what is actually out, and a total
  that was smaller than its own loans comes up to meet them.

  All three repairs are in `prisma/repair-demo.ts` rather than done by hand, so they are reviewable and
  repeatable. The sweep also confirmed what is *not* wrong: no future-dated payments, attendance,
  invoices or gate passes, no invoice paid more than it owed, no status disagreeing with its paid
  amount, and the 67 exams with no marks are all still to be sat.

  One real product gap fell out of it: **a child with no section is invisible to attendance.** One
  student — one I had admitted through the new-student form myself — was on the roll in a class whose
  sections both existed, belonging to neither. Attendance is marked per section, so that child would
  never have appeared on any register, and nothing anywhere said so. Not an error to refuse (a school
  really does admit a child before deciding where they will sit), so it is a WARNING in
  `validateStudentDetails`, shown live beside the Section field as the clerk chooses a class and
  disappearing the moment they pick one — the form navigates to the child's profile on success, so a
  warning that only came back with the server's answer would never be read. Children already in that
  state now say "no section" on the roll instead of a silent dash. 241 tests green.
- **2026-08-20** A school can raise a term's invoices. This was the thing that could not be done at
  all: the demo school has shipped with Terms 3 and 4 unraised since the first seed, and the reason was
  never a scenario — there was no code to raise them. It is the most consequential button in the
  product, so it has four properties on purpose. **Idempotent**: a child who already has an invoice for
  the term is skipped, so a second click, a double submit or a refresh cannot double-bill a family.
  **The preview is the same arithmetic as the write** — one `gatherTermBilling` and one
  `planTermBilling`, read by the screen and by the action, so the total a school agrees to is computed
  by the code that commits it rather than by a second estimate free to drift. **One transaction**: a
  half-raised term is a school where some parents owe money and others do not and nobody can tell which.
  **Gap-free numbers**: `reserveNumbers` moves the counter once and hands back the whole block, instead
  of 849 read-modify-writes on one row, each a chance to time out and leave a hole in the series a school
  gets audited on. And two clicks, because a button that bills 849 families on one click is a button
  somebody presses by accident.

  Raising invoices forced a decision the schema had been dodging. Concessions have never billed anything
  — five types, 172 students, display-only everywhere — so nothing had to decide *which heads* a
  concession comes off, and the seed encoded the answer as the magic string `"Tuition Fee"`. A rule that
  governs real money cannot live in a string literal, so `ConcessionType.appliesToHeads` is now a column
  (empty means every head) and the demo's five types point at Tuition Fee, which is what an Indian
  school's sibling, staff-ward and RTE concessions come off in practice. A concession still awaiting
  approval is not applied, and the screen says how many are waiting rather than dropping them silently.

  Verified by arithmetic against the seed's own invoices rather than by inspection: the Term 3 preview
  matched the seeded Term 2 to the rupee in all thirteen classes. The one class that appeared to differ,
  Nursery by ₹350, turned out to be ₹350 of late fees the seed applied to those invoices after raising
  them — `amount` includes `lateFeeAmount`, and a freshly raised term has none. Then raised it for real:
  849 invoices in one transaction, net exactly the ₹97,68,644 previewed, invoice numbers 01697–02545
  with no gap anywhere in the 2,545-invoice series, issue date today in IST, due 15 Oct, all UNPAID, and
  the new invoice showing up at the fee counter beside Term 2 with the right ₹13,700 and no late fee yet.
  A second attempt refused with "Every eligible student already has an invoice".

  Two after-effects worth stating plainly. **I then deleted those 849 test invoices and put the number
  sequence back to 1697**, because they were my test rather than the school's data: leaving them would
  have put ₹97 lakh of not-yet-due invoices on the dues screen and swamped the ageing buckets the demo
  is tuned around, and a preview that is ready to raise demonstrates the feature better than one already
  raised. The two audit rows stay. **What I did keep** is a two-invoice raise on Term 1: the screen
  opened on Term 1 rather than Term 3 because the two children I admitted through the new student form
  had no invoice for the terms already billed — a mid-year admission owing nothing at all is exactly the
  hole this screen is for, and the fix was two clicks. 238 tests green, tsc clean.
- **2026-08-20** Fee heads and fee structures are editable, which was the last piece of setup
  still seed-only. Until today a school could not add a fee head, raise its own tuition, or move a
  term's due date without someone editing the database — and the screen said so, ending with a line
  promising that editing was "coming in the next pass". That line is gone, replaced by the thing it
  promised. Three deliberate decisions: **zero means the head does not apply**, so blanking a cell
  removes the FeeStructureItem rather than leaving a ₹0 line on a parent's invoice — and that is
  exactly the act `canDeleteFeeHead` asks for before a head can go, so the two rules agree.
  **A whole class row saves at once**, in one transaction, because the row's total is what a term
  invoice is divided out of; saving it head by head would leave a class briefly priced at something
  nobody chose. And **nothing here touches an invoice already raised** — `FeeInvoice.lineItems` is a
  Json snapshot taken when the invoice was made, so a fee that changes in August cannot rewrite what
  a parent was billed in April. The screen says that in words, and so does every audit line.
  Pricing a class that has none creates its FeeStructure on the way, so a class added on the classes
  screen is no longer stuck unpriced.

  The thing I would have got wrong by reading rather than driving: **terms are per class in the
  schema.** The seeded school has 52 InstallmentPlan rows — four terms times thirteen classes — and
  the old read-only card rendered `structures[0].installments`, showing Nursery's four dates as
  though they were the school's. Editing that as displayed would have moved Nursery's Term 2 and
  left the other twelve classes where they were, silently. So the card now groups by term label,
  edits all thirteen copies in one write, says "applies to all 13 classes" before you save, and
  flags a term whose classes disagree instead of picking one and hiding the rest.

  Also: two spellings of the same audit prefix had appeared, `fee.` in the collection actions and
  `fees.` in these new ones, and `/app/settings/audit` keys its area labels on the first segment —
  so the new rows would have shown up unlabelled. Collapsed to `fee.`, and `student.` (which was
  already falling through the same map, unnoticed) now has a label too. The nine `fees.*` rows my
  own testing wrote into the demo database stay as they are: an audit log that gets tidied is not an
  audit log.

  Driven at the counter rather than reasoned about: raised Nursery to ₹22,500 typed with the comma,
  refused ₹2.32 crore with "Tuition Fee: That is over ₹50 lakh for one head — check the zeroes"
  while keeping the row in edit so nothing was lost, added a Smart Class head and watched it appear
  as a grid column, was refused its deletion with "1 class charges this head", moved it above
  Transport, blanked the cell, deleted it, moved Term 3 and put everything back. The demo school is
  as seeded: 7 heads, 72 items, four term dates on the 15th. 231 tests green, tsc clean.
- **2026-08-20** A money-screen bug, found while about to build fee-structure editing. The fee counter
  turned a typed amount into paise with `Math.round(Number(text) * 100)` — and `Number("13,700")` is
  **NaN**. So a clerk typing the amount the way the rest of the interface prints it, with the comma, saw
  **TOTAL TO COLLECT ₹0**. Not a wrong-amount bug (the submit button is disabled at zero, so nothing could
  be collected), but a dead end on the most-used screen in the product, with the clerk's input silently
  discarded. Now one tested `paiseFromText` in `money.ts` handles "13,700", "₹ 13,700.50" and stray
  spaces, tells "nothing typed" apart from "zero", and refuses letters, signs and "1.2.3"; the fee counter
  and the cash closeout both use it. Verified live: ₹13,700 and ₹13,700.50 both read correctly and the
  button enables. I also tried normalising the field back to what was understood on blur, could NOT get
  that handler to fire under automation, and removed it rather than ship a nicety I cannot prove works —
  the field reading "13,700" beside a total of ₹13,700 is coherent as it is.
- **2026-08-20** Phase 17: subjects, and who teaches them. `/app/settings/subjects` works a class at a
  time — 113 subjects across 13 classes is not a page anybody edits carefully in one list — and adds,
  renames, deletes, marks a subject elective or co-scholastic (graded rather than marked out of a total,
  which is how CBSE treats Art, PE and Work Education), and assigns teachers. That last part is not
  cosmetic: the teacher's own "marks still to enter" list is built from `StaffSubject`, so before this a
  teacher saw either everything or nothing. `setSubjectTeachers` replaces the whole set in one
  transaction rather than adding and removing one at a time, so a half-applied change cannot leave a
  teacher looking at marks that are not theirs; and because `StaffSubject` carries no `schoolId` of its
  own, the staff ids are checked against this school explicitly instead of being trusted as given.
  Deleting refuses with the reason and the count — "2 exam papers already exist for this subject. Marks
  and report cards refer to them" — shown both as the button's tooltip and as an error if it is clicked
  anyway. Also fixed a usability defect the seed exposed: two members of staff genuinely share a name
  (one Gopal Yadav is the librarian, the other a teacher; likewise two Neelam Pandeys), so both teacher
  pickers now read "Gopal Yadav · Librarian" — the office could not otherwise tell which one it was
  assigning. Driven end to end: added Sanskrit with a code, was refused on a subject with papers, toggled
  co-scholastic on and off again, removed and restored a teacher, then deleted Sanskrit. The demo school
  is back exactly as it was — 113 subjects, Drawing still marked rather than graded, so it stays
  consistent with the 768 report cards already published against it.
- **2026-08-20** Phase 16, the first slice of editable setup: classes, sections, and the class teacher.
  `/app/settings/classes` can now add and rename a class, add and remove a section, and say who the class
  teacher is — none of which was possible before, so a school could only be configured by handing us a
  clean Excel file. The class-teacher field matters more than it looks: the parent-to-class-teacher
  conversation in chat hangs entirely off `Section.classTeacherId`, so a section without one leaves those
  families with nobody to write to. The page counts them and says so, and `canBeClassTeacher` refuses
  somebody who has left the school for the same reason. Before writing any of it I moved the importer's
  private `tidyClassName`/`guessOrder` helpers into `src/lib/core/setup-core.ts` (25 tests): they lived
  inside a `"use server"` module, which cannot export a non-async function, so the new screens would have
  had to copy them — and two copies of "what does this class name mean" is how a school ends up with
  "Class 8" and "class 8" as separate classes, each holding half the children. Deleting refuses rather
  than cascades, in numbers: "24 children are in this section. Move them first — a section is not a way
  to remove students", and a section with attendance stays so the register stays readable. Driven end to
  end: assigned Priya Menon to a section (unassigned count 2 → 1), was refused on an occupied section,
  typed "12" and got Class 12 ordered last, typed "sec-a" and got section A, then removed both again.
  That also tidied away the Class 11 the import test had created — the school is back to 13 classes and
  23 sections with **zero** sections lacking a class teacher.
- **2026-08-20** Phase 15: a school can finally add and correct a student. Until now every student
  arrived from the seed or the Excel import — so a walk-in admission was impossible, a misspelt name
  could only be fixed by re-importing the whole register, and the roster's own primary green "Add
  student" button pointed at a page that was never built (it fell through to `/app/students/[id]` with
  id="new" and dead-ended). Now `/app/students/new` and `/app/students/[id]/edit` share ONE form and one
  validator, because an add form and an edit form that drift apart is how a school ends up able to type
  something at admission it can never correct. `src/lib/core/student-core.ts` (19 tests) holds the same
  rules the importer applies — required name and class, a date of birth that cannot be in the future, a
  suspicious birth year questioned but not blocked, +91 stripped, a short mobile warned about and still
  admitted. Two bugs fixed on the way. **The admission-number generator was broken**: `enrolApplicant`
  read the "last" number with `orderBy admissionNumber desc`, a LEXICOGRAPHIC sort that thinks NPS/999
  is greater than NPS/1848 and would hand a new child a number already on the roll; it also hardcoded
  the demo school's own `NPS/` prefix and ran outside the transaction, so two clerks admitting at once
  got the same number. One `allocateAdmissionNumber` now serves both callers: transactional, per-school,
  and it BOOTSTRAPS by adopting the school's existing habit (the sequence started at NPS/1849, not
  NPS/0001). **And a child admitted this morning was shown a red "below the 75% a board exam requires"
  alarm** on 0 of 0 working days — `eligibilityCheck` now reports no shortage when nothing has been
  marked. Verified by doing it: admitted a walk-in as NPS/1849 with a deliberately short mobile (warned,
  admitted), corrected her name and phone (+91 normalised, admission number untouched, audit carries the
  before/after and is reversible), and a clashing typed number is refused with "NPS/1001 already belongs
  to Disha Mishra."
- **2026-08-20** A correction to yesterday's hardening note, found while testing the new pages. Adding
  `app/loading.tsx` changed what an unauthorised request LOOKS like: a page's `requireRole` redirect now
  streams inside a 200 response instead of arriving as a 307, because the loading boundary has already
  committed the status by the time the page renders. The earlier claim that "every redirect was correct
  role gating" was measured before that boundary existed, and the final re-run masked it by filtering
  redirect lines out. **The gate itself is intact** — verified by diffing the bodies: a teacher asking
  for `/app/students/new` gets the skeleton plus two client redirects to `/denied` and ZERO protected
  content (no class list, no form, no field labels), while the principal gets the real form; and an
  unauthenticated request still gets a clean `307 → /login`, since the layout runs before the boundary.
  So this is status-code hygiene, not exposure: a browser lands on /denied either way, but a scanner or
  an uptime check sees 200. The proper fix is coarse role gating in middleware, which this repo
  deliberately does not have (rule 1, and per-page checks are the pattern) — swapping the whole auth
  approach in the week before a school sees it is the wrong trade. Left as a documented decision.
- **2026-08-20** The worst bug of the hardening pass, found by marking a real class rather than reading
  the code. The attendance sheet correctly said "Thursday, 20 August 2026" — and the save wrote to the
  **19th**. Two faults, one hiding the other. The action's future-date guard still compared against UTC
  today, so before 05:30 IST it refused today's own sheet as "a future date". And the client treated any
  error the action RETURNED exactly like a dropped connection: it queued the marks locally and showed
  "saved on this device — nothing is lost", so a teacher walked away believing the class was marked
  while nothing had been written and no sync could ever succeed. The guard now asks `schoolToday()`, and
  a refusal is no longer dressed up as a deferral — the marks stay on screen, the school's reason is
  shown, and nothing promises a sync that cannot happen. Re-marked Nursery A afterwards: 24 rows against
  2026-08-20, the right two children absent, audit line to match. Everything else in the pass held up
  when actually driven: fee collection (late fee added to invoice AND payment, ₹14,700, gap-free receipt,
  correct words), certificate issue → public verification (genuine cert confirmed, forged token refused
  without leaking), the messy-register import end to end (banner row skipped, "Adm.No"/"Std"/"Sex"
  matched, +91 stripped, dd/mm/yyyy parsed, 32/13/2010 refused, in-file duplicate caught, existing
  student flagged as UPDATE not overwrite, Class 11 created, then undone — 4 removed, Disha Mishra kept
  because she already has fees and marks), gate pass, bulk consent, and the full-school export (6
  sheets, 847 students, 1,694 invoices, 5,218 marks).
- **2026-08-20** Pre-demo hardening pass, driven page by page as every role. Smoke-tested all 42
  authenticated routes across six logins: **no 500s anywhere**, and every redirect was correct role
  gating. Then four real defects, all found by using the thing rather than reading it.
  **(1) The timezone.** Every "today" was derived in UTC (`toISOString().slice(0,10)`), and India is
  5½ hours ahead — so on a UTC server, between midnight and 05:30 IST the app showed YESTERDAY. That
  meant a receipt dated a day early (exactly what an auditor catches), a date picker whose `max` was
  yesterday so a clerk could not choose today, and worst, an attendance sheet that opened on yesterday
  — and because the offline sync key carries the date, the correction would not have overwritten it.
  Now one helper (`isoDay`/`schoolToday` in `src/lib/queries/when.ts`, Asia/Kolkata) derives every
  calendar day, with 8 tests pinning the 01:30-IST boundary. Hosting is next on this list, so this
  would have shipped broken. **(2) Serial numbers could leak.** `nextNumber` is careful to increment
  inside the caller's transaction — but the gate-pass and consent callers wrapped it in a transaction
  of its OWN, so a failed write burned a number and left a hole in a series a school gets audited on.
  Both now allocate inside the write. **(3) The consent path the UI actually uses was the wrong one.**
  `bulkConsent` never issued the CNS/ receipt number the product promises a parent as proof — all 3,389
  consent records had none — and, worse, refusing APAAR consent in bulk did NOT halt the APAAR
  workflow, though the single-record path did. Both paths now go through one `writeConsent`, which was
  the fix for the cause as much as the symptom: two copies of the same rule drifted apart. Verified in
  the browser — bulk refusal now flips `apaarStatus` to CONSENT_REFUSED, and a bulk grant issues
  CNS/0001–0003. **(4) No loading, error or not-found boundaries existed anywhere**, so a slow page
  looked frozen (the overview alone runs 15 queries) and any error dead-ended on Next's default screen.
  Added a skeleton that matches the real page shape, plus error/not-found/global-error in the product's
  own voice, saying plainly that nothing half-written can survive a failed render. Also: stat rows now
  sit two-up on phones instead of four stacked blocks, and the one table without a horizontal scroll
  container got one.
- **2026-08-19** Chat phase 6: web push — the last piece of replacing WhatsApp, because a message
  nobody is told about is not a message. `PushSubscription` (one row per browser, endpoint unique),
  `public/sw.js`, a manifest so the app can be installed, and `src/lib/push.ts` on the `web-push`
  package with VAPID keys generated on the school's own server: no provider account, no template
  approval, nothing per message. Two disciplines carried from phase 7's message log. With no keys
  configured push is a **no-op** — chat works completely without it and nothing ever claims a
  notification was delivered that no push service accepted. And a dead endpoint is **deleted, not
  retried**: browsers drop subscriptions when storage is cleared, the push service says so with 404 or
  410, and keeping those rows would mean a growing pile of guaranteed failures on every send. Verified
  that path for real — inserted a subscription with a valid keypair pointed at a dead FCM endpoint, sent
  a message, and the row was pruned while the message went through untouched. Notifying happens AFTER
  the commit and can never fail a send. Consent is per device, not per account, and the toggle reads the
  browser's own permission state rather than remembering a setting of its own, because the two would
  drift the moment somebody cleared their site data and the school would think a parent was reachable
  when they were not. `mutedAt` silences one conversation without hiding it — the unread badge still
  counts. Service worker verified registered and activated at scope `/`; the manifest serves. What could
  NOT be verified from here: the notification actually arriving, because granting permission needs a
  click on Chrome's own prompt, which is browser chrome and not part of the page. The honest caveat for
  the UI and the sales conversation stands — iOS delivers push only once a parent adds the site to their
  home screen. Deliberately no offline caching in the service worker: the attendance sheet already
  handles its own offline case, and a half-cached fee balance is worse than an honest "you are offline".
- **2026-08-19** Chat phase 5: lifecycle. The office can close a conversation and open it again —
  audited both ways and marked reversible, because closing is a timestamp and never a delete: the
  conversation stays readable for ever, the composer is replaced with a sentence saying so, and it simply
  leaves everybody's inbox. That is what a class-teacher handover needs now and what the year rollover
  will need when B5 lands, since otherwise a class teacher carries five years of other people's families
  in their inbox. The inbox therefore excludes closed conversations by default and offers "1 closed
  conversation" as a link rather than hiding them. `canPostInThread` also learned about a child who has
  left the school: history stays readable, but a family that has left does not keep a live line into the
  staffroom — passed as an optional fact, so "not asked" is deliberately distinct from "not active".
  Two tests cover exactly that distinction. What is NOT built, and why: `leftAt` on a guardian's
  participant row has nothing to hook onto — nothing in this product removes a `ParentLink` (only the
  seed creates them), and the protection that actually matters is already enforced and tested, since
  `readAccess` and `canPostInThread` both re-check guardianship on every call rather than trusting the
  participant row. The hook goes in the day a "remove guardian" screen exists.
- **2026-08-19** Chat phase 4: broadcast out, replies back privately — the shape that kills the class
  WhatsApp group without losing one-to-many reach. Zero new tables. A parent's notice card grows a
  "Reply privately" link; the recipient is derived from the circular's author rather than trusted from
  the URL, so a crafted link cannot turn "reply to the school" into a conversation with somebody else;
  and the reply opens or REUSES that parent's existing conversation with them, because a parent should
  have one conversation with the office, not eleven — one per notice they ever answered. Provenance
  therefore cannot live only in `originCircularId`, which is set once at creation: the message body
  carries a `Re: "<title>"` line, which lands in the immutable record instead of a column that a reused
  thread would not update. Verified with two parents answering the same notice: two separate
  conversations, neither able to see the other, both landing in the author's inbox with the notice as
  the subject. The office side gets the one thing a broadcast never told them before — `/app/notices`
  now shows "2 replies" against the circular that provoked them.
- **2026-08-19** Chat phase 3: audited oversight. The principal can now open any conversation and
  answer "what did the teacher actually say to that parent?", which is the thing that protects a school
  in a dispute — and the read is written to the audit trail with a name and a time. Three details make
  it real rather than decorative. The messages come back FROM the action, held in component state, so
  there is no `?open=1` that shows them without the audit row landing first, and a refresh loses the
  view rather than silently re-reading — looking again is a new recorded read and the trail says so.
  The read never inserts a `ThreadParticipant` row, verified in SQL (still 2 participants after the
  principal read it): otherwise she would count toward "everyone has read", the conversation would sit
  in her inbox for ever, and the parent would see her join, which is escalation rather than oversight.
  And the accountant is refused the same thread — reusing the `MONEY` role group by reflex would have
  handed accounts every parent-teacher conversation in the school. Participants are told, in a line
  under every conversation, that the office can open it and that each time is recorded; a school that
  hides its oversight has a worse problem than one that states it. Driven in the browser across
  principal, teacher, parent and accounts logins, and the trail renders under a new Chat filter at
  /app/settings/audit?area=chat.
- **2026-08-19** Chat phase 2. The rest of the matrix and, more importantly, the doors into it: a
  teacher's directory now carries the 41 families they actually teach (grouped, each labelled "Father
  of Nakul · Class 4 A"), staff reach colleagues, and parents keep their two doors. Two entry points
  put a conversation where the work already happens — "Message the class teacher" on each child's card
  on the parent's own screen, and "Message" beside each guardian on the student profile — because a
  directory nobody visits is a feature nobody uses. `/app/chat/new?to=…` now authorises the chosen
  recipient against `canStartThread` directly rather than against the list, so those links are safe and
  the list is only a convenience. `getStartableContacts` runs a FIXED number of queries rather than one
  per candidate: a class teacher of two sections has seventy-odd families and a round trip each would
  make the page unusable on a school's connection. Verified the reuse branch in the browser — a teacher
  writing from the student profile lands in the conversation that already exists rather than forking a
  second one (4 threads before, 4 after, 5 messages in the one). Also corrected a line on the student
  profile that had quietly become a lie: it promised a parent with no login "gets fee and attendance
  alerts by SMS/WhatsApp", which nothing has ever sent.
- **2026-08-19** Chat phase 1. The school's own messaging, replacing WhatsApp rather than integrating
  with it — because the queued `MessageLog` rows from phase 7 were never going to send, and because
  WhatsApp's real failure is structural: one group where every parent sees every other parent, and
  nothing on the record. What shipped: `MessageThread` / `ThreadParticipant` / `Message`, a nav entry
  with an unread badge for every role, an inbox, a thread view with Enter-to-send, a contact directory,
  and the parent ↔ class-teacher path end to end. Driven in a browser across teacher and parent logins.
  The whole permission model is a pure tested core (`src/lib/core/chat-core.ts`, 54 tests): staff open
  doors, parents may open exactly two themselves — their child's class teacher and the office. Verified
  refusals, not just the happy path: parent → other parent, parent → a teacher who doesn't teach their
  child, parent → a student, and a direct-URL attempt on another family's thread all come back with a
  sentence. Four design decisions worth remembering. (1) `Message` is column-for-column the aiLms
  `Message` so graduation is a copy, but chat graduation is lossy *by construction* for anything that
  is not parent-to-class-teacher, because aiLms makes `parentUserId`/`teacherUserId` mandatory — said in
  the schema rather than discovered later. (2) `Message.readAt` is never written: `ThreadParticipant`
  .lastReadAt is the single truth, and writing both would mean O(messages) updates on a *read* plus two
  counts that drift. (3) Unread is a counter incremented in the send transaction, because Prisma cannot
  compare `lastReadAt` to `Message.createdAt` across a relation without raw SQL and this repo has none.
  (4) Rule 5 is interpreted, not taken literally — thread lifecycle is audited, individual messages are
  not, or chat traffic would bury the money and marks trail the audit page exists for. Also seeded the
  case the demo could not show: one guardian with two children in different sections, which is exactly
  what breaks a thread key built on the user pair alone. Next: the rest of the role matrix, then audited
  office oversight.
- **2026-08-19** Landing page redesigned — "the staffroom sketchbook". The page now has its own
  scoped design system in `src/app/landing.css` (`.lp`), on the `src/app/s/public.css` precedent, so
  none of it can leak into the admin app: chalky paper `#f8f5ec`, deep bottle green ink `#0f3a2c`
  (the product's own green family), a **saffron** marker `#f79a3c` used only as a wash behind words,
  pastel taped notes, and a green **blackboard** band replacing the usual dark section. Hand-drawn
  monoline pen illustrations live in `src/components/marketing/sketches.tsx` (16 of them: register,
  papers, schoolhouse, bell, cap, clock, bus, globe, trophy, coin, stamp, tools, rule, star, loop,
  curved arrow) and carry all the imagery — no stock, no screenshots. Behind everything sits a
  page-height field of ~150 faint school objects at 4.5–10% opacity, drifting slowly, seeded from a
  fixed PRNG rather than `Math.random` so the server and client agree and React does not throw a
  hydration mismatch. The four `product-fragments` are reused as the only "screenshots", so the
  marketing stays honest as the product changes. Structure: hero -> migration as a three-step drawn
  flow -> attendance / fees / compliance features -> the blackboard (office, teachers, parents,
  principal) -> published price with the market comparison -> what's included -> FAQ -> close.
  Root layout gained Bricolage 800 and Roboto Mono for this page only. Fixed while building: the
  marker highlight needed `isolation: isolate` (a negative-z pseudo-element paints behind the
  section's own background and vanishes); the nav's yellow glow banded into visible concentric rings
  above 6% opacity; and the nav was sticky, which parked a pill on top of the very screenshots it
  asks you to look at. 105 tests still green, `tsc` clean, driven in a real browser at 1440 and 430.

- **2026-08-19** Phase 13 complete — ALL PHASES DONE. Flanca's own landing page at `/` (the root no
  longer redirects to login). Hero states the claim and shows the product doing the thing; the price
  is published in a full-bleed brand-green section, because "the price is on the website" is the
  strategy and nobody in this market publishes one. Instead of screenshots it renders LIVE FRAGMENTS
  of the real interface (attendance row, itemised parent invoice, APAAR worklist, import preview)
  built from the product's own tokens — always crisp, and honest as the product changes. Fixed a
  systemic UI bug: the `.eyebrow` utility baked in its own colour, so it silently overrode any
  text-* utility on a dark ground (the price label was near-invisible on green — the same class of
  bug as the school page's masthead). Colour removed from the utility and stated explicitly at all
  26 call sites. Timetable (by section OR by teacher, printable, with teacher
  double-booking surfaced rather than left for a Monday morning), homework + lesson plans, school
  settings (identity that prints on every receipt and certificate, recognition numbers, and a UPI ID
  that is format-checked because a wrong one sends a parent's money nowhere), the audit trail
  (filterable by area, paginated, explicitly immutable), and the FULL SCHOOL EXPORT — one .xlsx with
  students, staff, invoices, payments, marks and certificates on separate sheets. Verified live: the
  route returns a real 3.8 MB xlsx (correct MIME type, PK zip magic). Also checked and cleared a
  suspicion that viewing the payroll page mutated data — a fresh load creates no audit entry.
- **2026-08-19** Phase 11 complete. The school's own public page at `/s/<slug>` — a separate design
  system ("the gate board"): deep bottle-green enamel masthead carrying the school's real CBSE
  affiliation and UDISE numbers, Newsreader display over Instrument Sans body, warm paper ground,
  one marigold CTA. **The signature move: the page publishes the full fee structure, per class, head
  by head** — no Indian school website does this, and fee opacity is the market's loudest grievance.
  Plus public notices, the public calendar, admission form (honeypot, per-number rate limit,
  duplicate detection, +91 normalisation) and a self-service tracking page that explains each stage
  in a parent's words. Office side: /app/admissions with an application queue where the note you
  write is what the parent sees, and one-click "admit and put on the roll" that issues an admission
  number and copies the form across. Driven live end to end: applied on the public page -> got
  APP/26-27/0041 -> tracked it -> found it top of the office queue with a matching website enquiry.
  Fixed: the app's global h1 colour rule beat the board's inherited colour, rendering the school's
  name near-black on near-black green; an address that already contained the city printed it twice;
  and requireRole redirected to /denied, a route that did not exist (raw 404 on any permission miss).
- **2026-08-19** Phase 10 complete. One entry point, four homes: `/app` branches by role so a teacher
  lands on the sections they must mark (plus today's periods, marks still to enter, homework set),
  a parent lands on their own children (head-wise itemised invoice with the "you pay exactly X — no
  convenience fee" line, attendance with the 75% board warning, latest result, library books), and a
  student lands on their own day. The nav is now role-filtered — verified live: Priya Menon (teacher)
  sees only Today + Academics, Ashok Bhatia (parent) sees only Overview + Calendar; no Money, no
  Students, no Compliance. Parent/student logins seeded for a 40-student slice.
- **2026-08-19** Phase 9 complete. Library (issue/return/fine loop driven live: on-loan 47->46,
  overdue 36->35, shelf 36->37, fine moved to "to collect"), with library-core pure + 12 tests —
  capped fines, never charged on an on-time return, an issue check that gives the librarian a REASON
  to say out loud, and ISBN-10/13 checksum validation so a mistyped number is caught at the desk.
  Transport (routes, stops, riders, seat fill, fee-per-stop; GPS explicitly declined because it needs
  hardware the school has not bought). Stock & assets (reorder levels, stock value, AMC expiring
  within 60 days, needs-repair). Gate & visitors (who is in the building right now, plus early-pickup
  gate passes with a serial recording who took the child and on whose approval). Hostel (rooms,
  occupancy, mess menu). Hostel added to the nav.
- **2026-08-19** Phase 8 complete. Staff list with search/department filter and live attendance %,
  full staff profile (attendance strip, salary history, leave, subjects taught, periods per week,
  advances outstanding, NEP CPD hours against the 50-hour expectation, bank account masked to the last
  four), and a printable monthly salary register built FROM staff attendance. payroll-core is pure and
  tested (7 tests): loss of pay prorates the basic only so an accountant can reproduce every figure by
  hand, advance recovery never exceeds what is outstanding, and a payslip can never go negative.
  Rebuilding a register upserts rather than duplicating, so an attendance correction is simply re-run.
- **2026-08-19** Phase 7 complete. Circular composer with audience targeting (everyone / parents /
  teachers / staff / students / parents-of-a-class), channel picker that PRICES each channel before
  sending (in-app free, WhatsApp Rs 0.25, SMS Rs 0.18), in-app notification fan-out, and a message log
  showing this month's comms spend by channel so a bill is never a surprise. Paid messages sit QUEUED
  until a provider is configured and cost nothing — nothing is marked delivered that no provider
  accepted. School calendar: Monday-first month grid with weekends shaded and today marked, add-a-date
  form where a holiday is automatically excluded from attendance, and a public flag that feeds the
  school's own page. Fixed: naive title-casing rendered the PTM badge as "Ptm".
- **2026-08-19** Phase 6 complete. Six certificate types, each with its own gap-free serial sequence
  drawn inside the issuing transaction, frozen print snapshots, and a public /verify/<token> page that
  a receiving school can check (and which deliberately shows nothing beyond what is already on the
  paper). The Transfer Certificate carries the full 17-field statutory format including date of birth
  IN WORDS (dateInWords, 5 new tests — "Thirty-First December Two Thousand Nine"). Issuing a TC warns
  about outstanding fees rather than blocking, and only takes the child off the roll if the office
  ticks the box — a TC is sometimes issued for a passport. Cancelling retires a serial, never reuses
  it. Fixed: a date-only issue date parsed in local time landed at 18:30Z the previous day, so a
  certificate issued on the 19th printed "18 August"; all certificate dates now parse and render as UTC.
- **2026-08-19** Phase 5 complete. APAAR command centre: coverage + days-to-freeze countdown, a
  worklist where every row states the next action, inline Aadhaar name-mismatch diagnosis with a
  one-click "use Aadhaar name" fix (audited + reversible), bulk "paste IDs from UDISE+" matching by
  admission number, bulk mark-submitted, class-wise chase list, and a UDISE+ CSV export that LISTS
  its blockers in-file rather than silently dropping them. DPDP consent register: per-purpose
  coverage, a student x purpose matrix, bulk capture that REFUSES to grant without recording how the
  parent was verified, masked phone references, consent receipt numbers, notice versioning, and
  withdrawal of APAAR consent automatically halting the APAAR workflow. Driven live: renamed a
  student to match Aadhaar and granted a health-records consent, both verified in SQL. Fixed: a
  "use server" module exported constants, which is illegal and 500'd three unrelated pages —
  consent vocabulary now lives in src/lib/core/consent-core.ts.
- **2026-08-19** Phase 4 complete. Exam cycles with real entry progress, a spreadsheet-speed marks
  grid (type, Enter, next student; live grade per row; class average/highest/below-pass while typing;
  over-maximum typos blocked before save; localStorage recovery), report-card hub with subject-wise
  pass rates and ties-aware toppers, one-action generation for a whole class, and a print-perfect
  CBSE-style progress report (parent/teacher/principal signature blocks). Half Yearly papers added to
  the seed so the demo always has a cycle mid-flight. Fixed a REAL grading bug found on screen: the
  published CBSE bands are integer ranges (A2 ends 90, A1 starts 91), so every fractional percentage
  in between matched no band — 70 of 768 seeded cards were printing a blank grade. gradeFor now
  matches on the lower bound only; stored grades repaired via prisma/fix-grades.ts. Also: the report
  sheet now derives class and per-subject grade when an older snapshot lacks them, and an
  out-of-range typo no longer drags the live class average (952 made it read 352%).
- **2026-08-19** Phase 3 complete. Attendance overview (sections marked vs pending, absentee list,
  holiday/non-teaching awareness), the one-tap mark sheet (everyone starts present, big targets, prior
  absence streak flagged inline, marks persisted to localStorage and auto-synced when the connection
  returns), monthly printable register, board-eligibility shortage report with forward projection, and
  staff attendance pre-set from approved leave. Driven live: marked Class 6 A, saved 3 times, and SQL
  confirmed exactly 40 rows / 40 distinct students / 2 absentees — the clientKey upsert makes a replay
  after a dropped connection idempotent, so a teacher never marks a class twice. Fixed: a single-day
  holiday with a null endDate matched every later date (15 Aug showed as today's holiday), and a future
  ?date= in the URL rendered an attendance sheet for a day that had not happened.
- **2026-08-19** Phase 2 complete. Fees home (billed/collected/outstanding/overdue, ageing bar,
  class-wise roll-up, defaulter list ordered by age with multi-select reminders), fee counter
  (student search -> pre-filled balances -> opt-in late fee -> mode/reference/date -> total in figures
  AND words), print-perfect itemised receipt (parent + school copy, reconciliation rows, rupees in
  words, "no convenience fee" line), fee structure overview, and the day book with a cash closeout that
  records variance. Driven live: collected Rs 10,220 from a real student across two invoices with a
  late fee; verified in SQL. Fixed a MONEY bug — a ticked late fee was added to the invoice but not to
  the recorded payment, leaving the cash box short by the fine; also date-only payment timestamps
  printing "5:30 am" on every receipt, and a receipt that showed a full term's particulars against a
  part payment with nothing reconciling them.
- **2026-08-19** Phase 1 complete. Roster (search/class/dues/APAAR filters, paging), full student
  profile (fees, attendance + board-eligibility projection, results, compliance, conduct, library,
  transport, certificates), and the migration engine: upload -> validate -> preview -> approve -> undo,
  with a blank .xlsx template. Driven live with a deliberately messy register: title banner row skipped,
  every odd header matched (Adm.No/Std/Sec/Sex/DOB (DD/MM/YYYY)/Caste/Blood), +91 stripped, dd/mm/yyyy
  parsed, 32/13/2010 rejected, duplicate admission no + missing name blocked, an existing student
  flagged as an UPDATE not a silent overwrite, missing class "11" created as "Class 11", then the whole
  batch undone. Fixed: JSON date round-trip silently dropping every DOB on apply; phone search matching
  "21" inside every mobile; import row state overwriting its own validation verdict.
- **2026-08-19** Phase 0 complete. Verified in browser: login → Overview with real numbers
  (₹1,56,80,123 collected, 148 APAAR blockers, 23/23 sections marked). Fixed: fractional-rupee
  invoices, surname greeting, stale-session redirect loop.
