# Phase 0 — the decision record

*Opened 20 Aug 2026. The exit criterion for Phase 0 of [SUITE_PLAN.md](./SUITE_PLAN.md).*

Five decisions. All five are yours; none can be derived from the code. Each has a recommendation
with its reasoning, so the work is choosing rather than drafting. **Nothing in Phases 3–8 should
start until D1, D2 and D5 are filled in.** D3 and D4 do not block building — they block *selling*,
which is why they start now: they have the longest lead times of anything in the plan.

Fill in the **Decision** line and date it. When all five are decided, this file is the record of why,
and it should not be re-litigated without writing down what changed.

---

## D1 — How the tutor is priced into a school

*Revised 20 Aug 2026: the price came down a long way after finding CoSchool. See SUITE_PLAN §2.1.*

**Options** (full comparison in SUITE_PLAN §2.2):

| | |
|---|---|
| **A. School-wide licence, flat annual** | **₹1,20,000/yr to 750 students · ₹2,00,000/yr to 1,500**, whole roll, published, fair-use cap per child |
| **B. Opt-in seats** | School buys blocks; fee head only for families who opt in |
| **C. Parent-paid, school as channel** | Existing ₹249–799/mo B2C tiers, school takes a referral share |

**Recommendation: A, with B as the retreat inside the meeting, and C only for a school that
refuses both.**

Reasoning. A is one signature, predictable revenue, and — the part that matters — it is the only
option where the class teacher's cohort view is *complete*. Under B, a teacher sees the eleven
children whose parents opted in and not the nineteen who didn't, which makes the teacher surface
useless, and the teacher surface is the entire reason this is a merger rather than a bundle. C
forfeits the moat altogether: it is B2C with extra steps, it keeps the ~200-subscription break-even
problem, and it puts us back to fighting monthly card churn.

**On the number itself.** CoSchool sells this bundle into Indian schools today at ₹1 lakh under 500
students and ₹2 lakh above, published and refundable. That is the ceiling, and the first draft of
this plan sat 3.6× above it. Flat-per-school also matches Flanca's own DNA and the shape the market
is already trained to buy. At ₹1.2 lakh a 600-child school can charge parents **₹50/month**, keep
₹2.3 lakh, and hand a family a year of tutoring for ₹600 against a ₹4,000 coaching floor — which is
the whole point, and the reason not to price at what the market would bear.

The cost of A is that the school pays for children who never log in. That is not a flaw to fix, it
is the actuarial basis of the price: it works because most of the roll will be light users, and per
SUITE_PLAN §2.5 a heavy child now costs ~₹170/yr in tokens and a light one nearer ₹50.

**Decision:** ……………………………………………… *(date: ……………)*

---

## D2 — Whether a free-tier school can buy the tutor

Flanca is ₹0 under 200 students. The tutor has a real marginal cost per active child.

**Recommendation: no — the tutor requires a paid Flanca tier.**

Reasoning. The free tier is a deliberate land-grab that works because it costs us almost nothing to
serve. Attaching a product with a genuine per-child LLM bill to it converts a customer-acquisition
cost into an open-ended one, and it does so invisibly, which is the worst property a cost can have.
A pre-primary of 120 children is also the weakest case for the product on its merits: coaching
pressure barely exists below Class 5.

`School.studentCap` and `School.status` already exist and are the natural gate, so this costs no new
modelling. Suggested rule: the tutor is available on **School (₹7,500) and School+ (₹12,000)**, and
a free-tier school that wants it upgrades — which makes the tutor an upgrade *driver* for the ERP
rather than a discount on it.

**Decision:** ……………………………………………… *(date: ……………)*

---

## D3 — DPDP posture *(start immediately; does not block building)*

The tutor's core competence is per-child behavioural profiling — mastery scores, repeated mistake
patterns, time on task, what a child asked at 10pm. DPDP requires verifiable parental consent before
processing a child's data, prohibits tracking and behavioural monitoring directed at children, and
carries penalties up to **₹200 crore**. Consent Manager framework operational **13 Nov 2026**.

**Recommendation: get a written opinion from an Indian data-protection lawyer, this week, on one
specific question** — whether per-child educational profiling, conducted by a school as data
fiduciary, under verifiable parental consent, disclosed, not monetised and not shared with third
parties, falls outside the tracking/behavioural-monitoring prohibition.

Ask for the opinion to cover four things we can then build to:
1. What makes parental consent "verifiable" in this context, and whether Flanca's existing
   per-purpose consent register meets it or needs strengthening.
2. Whether the tutor's mistake-pattern and mastery data is "behavioural monitoring" or
   "educational record" — and what wording in the consent notice moves it.
3. Whether the school or we are the fiduciary for tutor-generated data, and what the processor
   agreement between us has to say.
4. What has to be true for a parent to withdraw consent — and what we must then delete.

Do not have this conversation with a general-practice lawyer, and do not proceed on my reading of
it. **This is the one item in the plan that can end the product, and it cannot be solved with code.**

The asset to point the lawyer at: Flanca already has a DPDP consent register with per-purpose
records and the consent logic in a tested core. The school is already the fiduciary and already
collects consent on our system. No direct-to-parent tutor in India can say that, which is why
handled properly this is the reason a school picks us.

**Decision / opinion received:** ……………………………………………… *(date: ……………)*

---

## D4 — Ownership of the tutor codebase *(blocks selling, not building)*

`aitutor` is a fork. `upstream` is `atulsinghhhh/ai-tutor`; **69 of 80 commits are theirs**, 4 more
under a second name, 2 by a bot. Your five commits are the landing-page redesign and the 401 fix,
2026-08-10, on branch `saurabh`. Licence: "Unlicensed / all rights reserved."

**Recommendation: settle it in writing before the demo, not before the pilot.** The demo is not
blocked — showing software to a school commits nobody. Taking a school's money for it does.

Four shapes, roughly in order of how clean they leave things:
1. **Co-founder / equity.** They built ~85% of it. If they want in, this is the honest answer and
   the cheapest one.
2. **Assignment or buy-out**, with a figure and a signed IP assignment.
3. **Licence** from them to us, with terms — worst of the options, because it makes half the product
   somebody else's leverage forever.
4. **Clean-room rebuild** of the parts that matter. Expensive, slow, and it throws away genuinely
   good engineering; only worth it if 1–3 all fail.

Whatever the shape, the thing to get is an **IP assignment or licence covering commercial use and
sublicensing**, not a handshake about being friendly about it.

**Decision:** ……………………………………………… *(date: ……………)*

---

## D5 — The target school

Everything from Phase 6 onward is aimed at one school's actual classes and actual syllabus. Aiming
once is much cheaper than building generically and retargeting, and a demo built for a named school
is a different object from a demo built for "schools".

**Recommendation: pick one school that scores on at least three of these five.**

1. **500–900 students, urban or large-town, CBSE or ICSE.** Big enough that the §2.1 arithmetic is
   material to the owner, small enough that there is no IT department to negotiate with.
2. **Stranded or unhappy with its current system** — ideally a Teachmint ERP casualty from its
   April 2026 exit, whose worst fear has already come true once.
3. **Behind on APAAR before 30 September 2026.** This is the sharpest reason for the meeting to be
   *this month* rather than after the exams.
4. **An owner or principal who has complained out loud about coaching** taking their children's
   evenings and their results' credit. This is the one that makes the tutor land instead of
   registering as a gadget.
5. **Somebody inside who will champion it** — a principal or senior teacher, not just the owner.
   A product introduced by the owner alone gets endured; one introduced by a teacher gets used.

Two anti-patterns: do not pick a school where you know somebody socially and cannot therefore be
told no honestly, and do not pick the biggest school you can reach — 1,500+ children means more
stakeholders, a longer decision, and a harder first pilot.

**School:** ……………………………………………… *(date: ……………)*
**Scores on:** ……………………………………………………………………………………

---

## Also settled in this phase, for the record

These did not need a decision, only writing down.

- **The two products keep separate databases.** Flanca's rule #1 ("one app, one database, no
  cross-app SSO, no event bus") stays in force *within* each product. Exactly one seam between them,
  narrow, versioned and audited — see SUITE_PLAN §4.2. No merged schema, no cross-DB foreign keys,
  no event bus, no shared design system.
- **In the school channel the tutor is a fee head, not a subscription.** Flanca already raises term
  invoices and takes UPI direct to the school at zero convenience fee. aitutor's Razorpay machinery
  is retained for the direct-to-parent channel, which becomes secondary.
- **No pricing is quoted to any school until the Phase 1 cost measurement exists.** Every number in
  SUITE_PLAN §2.1 rests on a per-active-student cost that has never been measured against a paid LLM
  key at school scale.
- **The guardian rule does not weaken.** In the tutor today, a student accepts and an adult cannot
  attach themselves; institutional cohorts are added *alongside* that, not instead of it.
- **Cohort views sort by lowest coverage first, never by score**, and every readiness figure travels
  with its confidence caveat. Both rules are already in the tutor's docs, both are right, and the
  integration must not quietly drop them.
