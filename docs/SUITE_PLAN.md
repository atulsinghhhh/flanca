# The Suite — Flanca + AI Tutor, and the road to a school demo

*Drafted 20 Aug 2026. Research pass plus a phased build plan. Governs two repos:*
*`~/Desktop/schoolSuite/simplifiedSMS` (Flanca, school management) and*
*`~/Desktop/schoolSuite/aitutor` (AI Tutor, student learning).*

Read alongside [PLAN.md](./PLAN.md), [MARKET_RESEARCH.md](./MARKET_RESEARCH.md),
[STATUS.md](./STATUS.md) and `aitutor/.docs/current-state.md`.

---

## 0. The thesis in one paragraph

A private school's owner has two anxieties that no school-ERP vendor addresses. The first is
administrative and we already answer it. The second is that **his own children are being taught
somewhere else in the evening, by somebody else, for more money than he charges for the whole
school year** — and that the coaching centre, not the school, is getting the credit for the
result. Flanca is how we get in the door and how we get paid. The tutor is how we become
un-removable, and it is where the money is. Sold separately they are two decent products. Sold
together, the school stops competing with the coaching centre and starts *being* it.

## 0.1 The five rules, as engineering constraints

Founder's framing, translated into things that can be checked in a code review. These are not
aspirations; each one forbids something specific.

**1. Two eyes. Either one works alone.**
The products are combined "like two eyes" — and a person with one eye still sees. So: no required
foreign key across the seam, ever. Every cross-product read is *enrichment*, optional, cached, and
degrades to the product's own behaviour when the other side is absent, unreachable, or simply not
bought. The tutor must work for a school that has never heard of Flanca and for a parent with no
school at all; Flanca must lose nothing but a panel if the tutor is switched off. **Test for it:**
point either product at a dead endpoint for the other and every screen must still render.
This also has a commercial reason, not only an architectural one — each product has to be sellable
on its own, because a bundle that only works whole can only be sold whole.

**2. Justify every penny.** The target price to a parent is **₹50/month**, and the reason is in
§2.6: a child can get free doubt-solving in four places, so anything we charge for has to be
something free cannot do. Corollary that binds the code: **never bill for what a child does not
use**, and never build a feature whose purpose is to make the invoice look bigger.

**3. Profitable on the first school, not the thousandth.** "It comes good at scale" is the sentence
before most edtech obituaries. §2.4 restructures the deployment so one school clears its own costs.
Every new fixed cost has to answer: is this per-school runtime, or is it a one-off asset every school
then shares?

**4. The school keeps control.** The tutor reaches a parent *through* the school, never around it.
No direct marketing to parents, no in-app upsell to a child, no contacting a family the school has
not introduced us to. The school is the data fiduciary and the relationship owner. This is what makes
a principal willing to hand us their parents, and it is also the DPDP position (§3.1).

**5. Trust before revenue.** Flanca stays cheap and stays free under 200 students. It is the entry,
the trust and the data — it is not where the money comes from, and it must never be squeezed to look
like it is.

---

## 1. Research — the coaching wedge

The school-side market research is already done ([MARKET_RESEARCH.md](./MARKET_RESEARCH.md)):
₹17–23k/yr price bar, Teachmint's April 2026 ERP exit, the 30 Sept 2026 APAAR/UDISE+ freeze, DPDP
from Nov 2026. What follows is the research that did not exist — the tuition side.

### 1.1 The second wallet

Every parent at a private school pays the school once and pays somebody else again.

| Fact | Number | Confidence |
|---|---|---|
| Students enrolled in private coaching, 2025 | **27%** nationally · **30.7% urban** · 25.5% rural | High — CMS Education Survey 2025, 52,000 households |
| Urban household spend per student per year on coaching | **₹3,988** (rural ₹1,793) | High — NSSO CMS |
| Urban, higher secondary | **₹9,950/yr** (rural ₹4,548) | High |
| Total household spend per child per year on school education | ₹22,024, of which **41% is coaching** | Medium — secondary reporting of CMS |
| Households taking some private tuition | "more than half (55%)" | **Low** — conflicts with the 27% above; do not use |
| Annual household spend on private education in India | ~₹5 lakh crore | Low–medium — estimate, not a survey |

**The ₹22,024/41% figure and the ₹3,988 figure cannot both be averages over the same population.**
Rather than pick the flattering one, the business case below uses the conservative floor:
**₹4,000/child/yr in a primary/middle urban private school, rising to ~₹10,000 by Class 11–12.**
The case survives on the low number, which is the only reason to trust it.

Set that against our own price: **Flanca is ₹12,000/yr for a school of 1,500.** One family's
coaching bill is comparable to what the entire school pays us for its administrative spine. That
asymmetry is the whole opportunity.

### 1.2 The legal gift — and it is a large one

The Ministry of Education's coaching guidelines, plus state rules now following them, restrict the
competition in exactly the band where a school has the most children:

- **Coaching centres may not enrol students below 16.** Enrolment is permitted only after the
  secondary school examination.
- **No coaching during school hours**, explicitly to prevent "dummy schools".
- No guaranteed-rank or misleading claims; tutors must be graduates; unfair fees carry a fine up to
  ₹1 lakh or cancellation of registration.
- **Andhra Pradesh Coaching Institutions (Regulation and Control) Rules, 2026** goes further in
  draft: dummy-school ban, a five-hour daily cap, mandatory wellness cells, CCTV, fee transparency.
  Other states are expected to follow.

Read that carefully. **For Class 3–10 — the majority of any K-12 school's roll — the formal
coaching sector is legally constrained from serving the child at all.** What fills the gap today is
an unregulated cottage industry of private tutors in front rooms, which a principal cannot compete
with and cannot see.

A school that can say *"your child's extra teaching happens here, supervised by the class teacher
who already knows her, on the school's own system"* is not making a marketing claim. It is
occupying ground the regulator has cleared of the alternative. This is the single strongest fact in
this document, and it is worth more than any feature.

### 1.3 What the competition charges

| Anchor | Price | Note |
|---|---|---|
| Khanmigo (global benchmark) | **$15/student/yr** (~₹1,320) | 700k+ K-12 users |
| Typical Western AI-tutor B2B band | $4–10/student/**month** | ~₹350–880/mo — irrelevant to India, useful as a ceiling |
| Indian school ERP tier | ₹9,000–23,000/yr flat, whole school | None of the *ERP* players bundle a tutor |
| **CoSchool — school + AI tutor, in India, now** | **₹1 lakh/yr <500 students · ₹2 lakh/yr >500** | The direct competitor. See §2.1 |
| aitutor's own B2C tiers today | ₹249 / ₹399 / ₹799 per month | Break-even needs ~200 subscriptions |

Three conclusions. First, ₹1,320/child/yr is a defensible international reference point for
per-student AI tutoring, and it is *a third of the conservative coaching floor*. Second, industry
reporting for 2026 is explicit that **B2B and B2G have become more attractive than B2C in Indian
edtech** — an argument for the merger, not merely for a bundle. Third, and least comfortable:
**the idea is not unoccupied.** CoSchool is selling it into Indian schools today at a published
flat price. That is not a reason to stop — it is validation, and their price is our ceiling — but
any plan that assumes an empty field is wrong before it starts.

### 1.4 Why the combination is not just a bundle

A bundle is two logins in one invoice. What makes this defensible is a loop neither product can
close alone:

```
Flanca knows          →  the tutor needs it        →  the tutor produces          →  Flanca surfaces it
─────────────────────────────────────────────────────────────────────────────────────────────────────
class, section, board    scoping every lesson,        mastery per topic,             to the class teacher,
the real roster          nothing to configure        the mistakes a child            beside her own marks
                                                     actually repeats
marks, exam results      where the child is weak,     time on task, chapters         to the parent, inside
attendance               without a diagnostic         completed, readiness           the school's own report
homework set, exam date  what to teach this week      what the child asked at 10pm   card and parent surface
```

No coaching centre has the left column. No school ERP has the right. **Only a product that owns the
school's records can aim the tutor without asking the child to describe their own weakness, and
only a product that owns the tutor can tell a class teacher what her children do after 6pm.** That
is the moat, and it is a data moat, not a feature list.

---

## 2. The commercial model

*Rewritten 20 Aug 2026 after finding the direct competitor. The first draft of this section priced
the tutor at ₹1,200/child/yr — roughly 3.6× the market. That was wrong and the correction matters
more than the original.*

### 2.1 Somebody is already doing this, and their price is the ceiling

**CoSchool (`coschool.ai`)** sells an AI tutor named Vin plus school management to Indian private
schools: homework completion data for teachers, concept-level gap detection, lesson-plan generation,
parent communication, leadership visibility. Their own phrase is "transformation without
disruption" — same curriculum, same teachers, same timetable, AI as a layer over it. LinkedIn Top
Startup 2025 *and* 2026. Named partner schools include The Heritage School Delhi, Meridian
Hyderabad, Suchitra Academy Hyderabad.

**Their price is published: ₹1 lakh/yr under 500 students, ₹2 lakh/yr above 500 — flat, per school,
fully refundable after the trial.**

That is ₹167–333 per student per year for the school-plus-tutor bundle. It is the number our price
lives underneath, and it is not a number to be casual about: it is set by a funded, awarded company
with real schools already on it.

Two things follow. First, **the ₹1,200/child arithmetic in the first draft of this plan was fantasy**
— it would have been laughed out of a meeting the moment a principal Googled the alternative.
Second, and more usefully: their price is flat per school, published, and refundable. That is
exactly Flanca's own DNA, which means the market has already been trained to buy the shape we want
to sell.

Where they are beatable is not price alone. It is that CoSchool is an AI layer *over* a school's
existing systems. We would be the school's system *and* the tutor, on one roster, with the fee rail
underneath. Which brings the loop in §1.4 back — theirs has to ask the school for data; ours owns it.

### 2.2 The price, and who keeps what

Flat annual per school, banded, published, no per-student maths — the same shape as Flanca itself.

| Band | Flanca | Tutor | Bundle | vs CoSchool |
|---|---|---|---|---|
| ≤ 200 students | ₹0 | not offered (D2) | — | — |
| ≤ 750 | ₹7,500 | **₹1,20,000** | ₹1,27,500 | vs ₹1,00,000–2,00,000 |
| ≤ 1,500 | ₹12,000 | **₹2,00,000** | ₹2,12,000 | vs ₹2,00,000 |

Now the part that matters, for a 600-student school at the ₹1,20,000 band:

| | Per year |
|---|---|
| School pays us (both products) | ₹1,27,500 |
| School charges parents, at **₹50/month** per child | ₹3,60,000 |
| **School keeps** | **₹2,32,500** |
| **Parent pays** | **₹600/yr — against a ₹4,000 coaching floor** |

**₹50 a month is the number this whole product should be judged against.** It is less than a single
tuition sitting. A middle-class parent handing over ₹600 for a year of a tutor that knows their
child's actual marks is not being asked for hope money — they are being asked for something they can
verify by September. That is the test in §2.5, and it is the reason to price here rather than at
what the market would bear.

The school's ₹2.3 lakh surplus is not a giveaway either. It is what makes the school *defend* the
product internally, and a product the school defends survives a bad week. A school that merely
resells at cost drops it the first time a parent complains.

### 2.3 Collection — the structural advantage nobody else has

**Flanca already raises term invoices and takes UPI paid directly to the school with zero
convenience fee.** So the tutor needs no payment rail in the school channel: it is a `FeeHead`.

No Razorpay subscription per parent, no card declines, no monthly churn, no dunning, no 2%
convenience fee, no 1% SBI Card education surcharge. It rides the fee cycle the school already
enforces socially — and school fees get paid.

Every B2C AI tutor in India is fighting monthly voluntary retention against a parent's credit card.
We would bill annually, through an institution, at ₹50/month per child. Keep aitutor's Razorpay
machinery for the direct-to-parent channel; it becomes the second channel, not the first.

### 2.4 Profitable at one school — how the cost is actually structured

The founding constraint is that this works at **one** school, not only at a thousand. The first
draft's ~₹12,400/month fixed deployment made that impossible: ₹1.49 lakh/yr of infrastructure
against ₹1.28 lakh of revenue is a loss on the first customer, and "it comes good at scale" is the
sentence that precedes most edtech obituaries.

It is fixable, because **most of that ₹12,400 is not per-school cost at all.** Look at what the two
expensive lines are for:

| Line | ₹/mo | What it actually is |
|---|---|---|
| Render worker (ffmpeg) | 3,000 | Builds lesson videos |
| Kokoro TTS | 1,600 | Narrates lesson videos |

Rendered videos are **already cached by (class, board, lesson) and shared across students** — the
library is bounded by the syllabus, not by headcount. ~30 GB covers it fully populated. Which means
these two lines do not belong to a school's runtime at all. They belong to a **content factory** we
run occasionally, centrally, to build a syllabus-shaped asset once that every school then reads
forever.

That reframing is the whole answer to profitability at N=1:

| | First draft | Restructured |
|---|---|---|
| Postgres | 3,000 | 1,500 *(small instance at one school)* |
| Redis | 1,000 | 1,000 |
| API | 1,600 *(2 replicas)* | 800 *(one box; accept deploy blips at one school)* |
| Render worker | 3,000 | **0 — content factory, run on demand** |
| Kokoro TTS | 1,600 | **0 — same** |
| Load balancer | 800 | **0 — not needed in front of one box** |
| Storage, monitoring, misc | 1,400 | 1,000 |
| **Per-school runtime** | **₹12,400/mo** | **~₹4,300/mo** |

One school, 600 students, at ₹1,27,500/yr — **the figures immediately below are superseded.** They
assume a managed-cloud runtime, which is the wrong shape of infrastructure for a single school. On a
₹800/month VPS with Neon, Upstash and R2 free underneath (`../../docs/DEPLOY_FREE.md`) the real
infrastructure cost is ~₹9,600/yr and the first school clears **~74%**, not 25%. See
`../../docs/BUSINESS_CASE.md` for the corrected model at every scale. Kept here because the *shape* of
the argument — that the render worker and TTS box are a content factory rather than per-school
runtime — is what made the correction possible.

| | |
|---|---|
| Revenue | ₹1,27,500 |
| Runtime infrastructure | ₹51,600 |
| LLM (see below) | ~₹44,000 |
| **Margin** | **~₹32,000 — 25%** |

Thin, but **positive on the first school**, which is the requirement. At five schools the runtime is
shared and the margin goes past 70% without touching the price. The content factory is a startup
cost paid once per chapter, not per school — and it is the same asset that makes the product good.

### 2.5 The LLM bill is no longer the problem — and this is new information

The first draft treated the token budget as the binding constraint. That was true of the free tier
and is not true of the market. As of August 2026:

| Model | $/M input | $/M output |
|---|---|---|
| **Gemini 2.5 Flash-Lite** | 0.10 | 0.40 |
| **DeepSeek V4-Flash** | 0.14 | 0.28 — **cached input ~0.003** |
| Gemini 3.1 Pro | 2.00 | 12.00 |
| Claude Opus 4.8 | 5.00 | 25.00 |

A *heavy* student-month measures ~783k tokens. On Flash-Lite that is about **₹14/month — ₹170 a
year.** A light student is nearer ₹50/yr. So per-student LLM cost is an order of magnitude below the
₹399/month the B2C tiers were built around.

And the structural win: **the syllabus context is identical for every student in a class.** DeepSeek
V4-Flash prices cached input at roughly 1/47th of fresh input, so once a chapter's context is warm,
the marginal student on that chapter is close to free. The tutor already has an exact-match
generation cache in `gatewayChatCompletion`; prompt-caching the chapter context is the same idea one
layer down, and it is where the cost work should go.

Two caveats worth keeping honest. **The rates in `pricing.ts` are all genuine `$0` today** because
both providers are on free tiers, so the admin dashboard will read zero while you are being billed —
fill them in with the table above before anything is live. And these are per-call averages measured
on a dev database with 32 users; **re-run `scripts/cost-model.ts` once real students arrive**, which
is precisely why it is a script and not a stored number.

### 2.6 The free-alternatives test — "justify every penny"

Before charging a parent anything, the honest question: **why pay ₹50/month when Doubtnut solves a
photographed question for free?**

What a parent can already get for ₹0 in 2026: Khan Academy, entirely free. Doubtnut, free
photo-based doubt solving. Physics Wallah, free video lectures and — for Class 10 CBSE 2026 boards —
free doubt support and offline mock preboards. Alarmind, free AI doubt solving with no paid tier.
Plus a free frontier chatbot on the parent's own phone.

**On "solve this question", we cannot beat free, and should stop trying.** Any pitch resting on
doubt-solving is dead on arrival.

What none of them can do — structurally, not because they haven't got round to it:

- They do not know the child's **marks**, so they cannot tell her what to revise.
- They do not know her **attendance**, so they cannot see she missed the two lessons the topic rests on.
- They do not know her **teacher**, so nothing she learns comes back to the classroom.
- They do not persist **her own repeated mistakes** across months and features — the tutor's
  `mistake_patterns`, fed by four different surfaces into one count, is the single feature no free
  app has an equivalent of.
- Nobody **stands behind** what they tell her. A parent report the school's own class teacher has
  seen is a different object from an app's dashboard.

So the pitch is not "an AI tutor". It is **"the tutor that has your child's report card open."**
Everything in §1.4's loop exists to make that sentence true, and everything a free app does well is
a reason to keep the price at ₹50/month rather than pretend we are worth more.


## 3. The three risks worth naming before any code

### 3.1 DPDP — simultaneously the biggest risk and the moat

The tutor's core competence is building a per-child behavioural profile: mastery scores, repeated
mistake patterns, time on task, what they asked at 10pm. Under the DPDP Act, for a child:

- **Verifiable parental consent is required before processing**, and a tick-box on an admission form
  does not qualify.
- **No tracking, no behavioural monitoring, no targeted advertising directed at children.**
- Penalty for children's-data breaches: **up to ₹200 crore.**
- Consent Manager framework operational **13 Nov 2026**; wider obligations by mid-May 2027.

"No tracking or behavioural monitoring of children" is not a footnote for a product whose entire
value is behavioural monitoring of children. The defensible reading is that monitoring *for the
child's own education, with verifiable parental consent, disclosed, not monetised and not shared* is
lawful — but that reading needs a lawyer's signature, not a developer's confidence. **This is the
one item on this list that can end the product, and it cannot be solved by writing code.**

The flip side: **Flanca already has a DPDP consent register with per-purpose records** — built in
Phase 5, with the consent logic in a tested core. The school is the data fiduciary, it already
collects consent from parents on our system, and the tutor becomes a declared purpose inside a
register that exists. **No standalone B2C tutor in India can offer that.** Handled properly, DPDP is
the reason a school picks us over a direct-to-parent app. Handled carelessly, it is a ₹200 crore
line item.

### 3.2 The tutor cannot honestly be called syllabus-grounded today

59 knowledge chunks. One comprehensive chapter (Ray Optics). **258 Class 3–8 topics with zero
chunks.** Embeddings unset, so retrieval runs on hash-derived mock vectors — dimensionally correct,
semantically noise. `past_paper_questions` empty. Exactly one authored `board_trick` chunk.

For a demo this is survivable and even simple to handle: you do not need the syllabus, you need
**the four chapters the demo school is teaching that week, authored properly.** But it must be said
out loud in the meeting, because a principal will test it on the chapter his daughter is stuck on,
and a lesson generated ungrounded from the model's own memory of NCERT is exactly what a
subject teacher can spot in thirty seconds.

Authoring content is editorial work at a rate no amount of engineering changes. Plan it as such.

### 3.3 Ownership of the tutor

`aitutor` is a fork. `upstream` is `atulsinghhhh/ai-tutor`; **69 of 80 commits are theirs**, 4 more
under a second name, 2 by a bot. Your own five commits are the landing-page redesign and the 401
fix, all on 2026-08-10, on branch `saurabh`. The licence reads "Unlicensed / all rights reserved."

If this becomes half of a product sold to schools, that has to be resolved in writing — assignment,
buy-out, co-founding, or a clean-room rebuild of the parts that matter. It is cheap to settle now
and ruinous to settle after the first school pays. Nothing technical in this plan is blocked by it;
the *demo* is not blocked by it either. Signing a school is.

---

## 4. The architecture of the seam

### 4.1 What the two systems are

| | Flanca | AI Tutor |
|---|---|---|
| Shape | Next.js App Router monolith, one DB | Express API + BullMQ worker + React/Vite SPA |
| Data | Postgres, 76 tables, `schoolId` on everything | Postgres + pgvector, 47 models, **no tenancy at all** |
| Auth | NextAuth cookie session → `requireActor()` returns `{id, schoolId, roles[]}` | JWT, payload is literally `{ userId }` |
| Tenant | `School` (+ `board`, `studentCap`, `status`, `slug`) | none |
| Identity of a child | `Student` row; `userId` **optional** — logins exist for a 40-student slice by design | `User` row, mandatory, self-registered |
| Tests | 428, on pure cores | **0** |
| Deployed | no | no |

Flanca's rule #1 is *"One app, one database. No cross-app SSO, no event bus, no microservices."*
That rule was written for Flanca's own scope and it is right there. It cannot survive contact with
a second product that has its own Postgres, its own worker, its own vector extension and its own
render pipeline. **Do not try to merge the databases.** The correct reading is to keep the rule
inside each product and accept exactly one seam between them, narrow, versioned and audited.

### 4.2 The seam, concretely

Four pieces, in dependency order:

**1. Tenancy in the tutor.** Add an organisation to aitutor: `Organisation` (id, external school id,
name, board, plan, seat cap, status) and `orgId` on `User`. Then the guardian/cohort code, which
today means "students who individually consented to link to me", gains a second, institutional path:
a class teacher sees her section because the roster says so.

> **Revised 20 Aug 2026, on contact with the code.** This originally said to extend
> `AuthTokenPayload` from `{ userId }` to `{ userId, orgId }`. That is the wrong call and it was not
> done. A JWT here lives seven days; school membership does not — a child leaves, an account is
> suspended for non-payment, a seat is withdrawn — and the claim being carried is *which children
> this account may read*, which is exactly what you cannot afford to have go stale. The repository
> had already made this decision once, in `requireAdmin`, which looks role up fresh "so revoking
> admin access takes effect immediately instead of waiting for the token to expire". Tenancy deserves
> at least the care that admin does. So `orgId` is read fresh, on the routes that need it, via
> `orgContextFor` / `requireOrg` in `src/organisations/context.ts`. Cost: one indexed lookup on
> org-scoped routes only.

**2. Provisioning, not signup.** A server-to-server endpoint that creates tutor accounts from a
Flanca roster: name, `classLevel` from `Class.name`, `board` from `School.board`, email, org. Every
field aitutor's signup schema demands already exists on Flanca's `Student` except the password —
which provisioned accounts should not have. Note the real cost here: **Flanca deliberately does not
give every student a login.** School-wide tutor rollout means school-wide student identity, which is
a genuine new piece of Flanca work, not a copy.

**3. One-click entry, no second password.** From Flanca's student and parent home, a button that
lands in the tutor already signed in: Flanca mints a short-lived signed handoff token (60s, single
use, `studentId + schoolId + purpose`), the tutor verifies it and issues its own JWT. Not shared
cookies, not a shared secret in the browser, not a synced password. Two apps, one door.

**4. The loop.** The part that makes it a combo (§1.4). Start with the two edges that need no new
modelling: *class + board + roster* going right, and *mastery + repeated mistakes per student*
coming back into Flanca's existing teacher and parent surfaces. Homework and exam dates going right
are the second pass; readiness into the report card is the third.

### 4.3 What must not be built

- **No merged database, no shared Prisma schema, no cross-DB foreign keys.**
- **No event bus.** Two edges, called directly, retried, audited via Flanca's `audit()`. If a third
  edge appears, revisit — not before.
- **No new payment integration** in the school channel. It is a fee head (§2.2).
- **No shared design system.** Flanca is "ledger & slate", the tutor is its own thing, and the
  school's public page is a third. Three deliberate voices already; a fourth reconciliation project
  is not on the critical path to a demo.

---

## 5. The phased plan to a school demo

Nine phases. Each states its exit criterion, because a phase without one is a wish. Effort is in
focused working days and assumes the current pace of both repos.

### Phase 0 — Decisions, not code · ~2 days

Nothing below can be sequenced without these, and all of them are yours, not mine.

1. Pricing model — A, B or C from §2.3.
2. Whether a free-tier Flanca school can buy the tutor at all.
3. DPDP posture: get a lawyer's written read on child profiling for educational purpose under
   verifiable parental consent. Start this on day one; it has the longest lead time of anything here.
4. The tutor's ownership (§3.3).
5. **The target school.** One. Named. Ideally one that is already stranded by Teachmint's exit, is
   behind on APAAR before 30 September, and whose owner has complained about coaching. Everything
   downstream is aimed at that specific school's classes and syllabus, and it is much cheaper to aim
   once than to build generically and retarget.

*Exit:* a one-page decision record in this repo, and a school's name on it.

### Phase 1 — Both products on the real internet, and the cost measured · ~5 days

Neither is deployed. A demo cannot be two localhosts and a promise, and no pricing is real until the
LLM bill is.

- Flanca → hosting, managed Postgres, backups, a real `AUTH_SECRET`, flanca.online pointed at it.
- aitutor → apply the Render blueprint, wire its five secrets, decide where Postgres/Redis/S3/Kokoro
  actually live. **Repair the migration drift first** (`prisma/migrations/` has diverged from the
  schema because development used `db push`; `migrate deploy` against a fresh production DB will
  fail).
- Swap the tutor onto a **paid LLM key** and fill in the real rates in `pricing.ts`. The free tier
  supports ~7 heavy students and cannot host a demo, let alone a school.
- Then run `scripts/cost-model.ts` against real usage and get the per-active-student number that
  §2.4 says the pricing depends on.

*Exit:* both products reachable over HTTPS by someone who is not you, and one honest rupee figure
for what a student-month costs.

### Phase 2 — Browser-drive everything that exists · ~4 days

Both repos have the identical, unglamorous gap: large amounts of recent work verified only by
typecheck, build and HTTP. Flanca's exams, timetable, homework, concessions, transport, hostel,
stock and setup checklist have never been driven by a human. The tutor's three-column lesson layout,
roadmap rail, video cards, canvas, drag-and-drop and invite pages have never been *rendered*.

This is before the seam, not after, and deliberately so: building an integration on top of two
un-driven UIs means every bug found later has two possible homes. Do it now, while a failure is
attributable.

*Exit:* every screen either driven and working, or on a defect list. Nothing in an unknown state.

### Phase 3 — Tenancy in the tutor · ~4 days

`Organisation` + `orgId` on `User`; `{ userId, orgId }` in the JWT; org-scoped plan limits (the
`limits` JSON already supports per-band overrides, so per-org is the same mechanism); an admin view
of an org's seats and usage. Institutional cohorts alongside the existing consent-based guardian
links — **without weakening the guardian rule**, which is deliberate safeguarding: a student
accepts, an adult cannot attach themselves.

*Exit:* two orgs on one instance, provably unable to see each other, with a test that says so.
**And the tutor's first automated tests, on the tenancy boundary.** Zero tests was tolerable for a
solo B2C product; it is not tolerable for the code that keeps School A's children away from School
B's.

### Phase 4 — Provisioning and one-click entry · ~5 days

The server-to-server roster endpoint, and the handoff token (§4.2 items 2 and 3). Plus the Flanca
side of student identity — school-wide student logins, which today exist for 40 children on purpose.
Every write audited through Flanca's `audit()`, because "who gave this child an account" is exactly
the question a DPDP audit asks.

*Exit:* a clerk clicks one button in Flanca, a class of 40 has tutor accounts, and a child signs in
from the school's own parent portal without ever seeing a second password.

### Phase 5 — The loop · ~5 days

Right: class, section, board, roster. Back: mastery per topic and repeated mistakes per student,
into Flanca's existing class teacher view and parent surface. This is the phase that turns two
products into one, and it is the phase to demo hardest — everything before it is plumbing a
principal cannot see.

Two rules carried from the tutor's own docs, both correct, both worth keeping: **cohort views sort
by lowest coverage first, never by score** (a class list ordered best-to-worst is a leaderboard by
another name), and **every readiness figure travels with its confidence caveat**, because a parent
shown "24%" without being told it rests on 3 of 9 topics will draw a conclusion the data cannot
support.

*Exit:* a class teacher opens Flanca and sees which of her children are struggling with what, from
the tutor, next to her own marks — and a parent sees the same thing about their own child only.

### Phase 6 — Content for the demo school · ~6 days, mostly editorial

Not the syllabus. **The four to six chapters that school is teaching in the demo week**, authored
properly: concepts, derivations, common mistakes, board tricks, past-paper questions via
`scripts/import-pyq.ts`. Plus **real embeddings** — swap off the mock vectors, because the RAG path
is currently retrieving noise and a subject teacher will notice.

Do the demo school's actual Class 9 or 10 Science and Maths first. That is where coaching pressure
is highest and where the school's own teachers will be most sceptical.

*Exit:* a subject teacher from that school reads a generated lesson on a chapter she teaches and
does not find an error.

### Phase 7 — The combined demo, built as a thing · ~4 days

A demo is a product, not a slideshow. What it has to prove, in order:

1. **Switch on.** Empty database to a working school in one sitting — Flanca can already do this
   end to end and nobody outside the seed has ever watched it happen.
2. **The child.** A real child of that school, in their real class, taught their real chapter,
   photographing their own handwritten working and being told which line went wrong.
3. **The teacher.** Her section, lowest coverage first, from data she did not enter.
4. **The parent.** Fee status with an honest breakdown, ₹0 convenience fee — and their own child's
   weak topics, in the parent copy of the text, not the student copy.
5. **The owner.** The arithmetic in §2.1, on his own roll count.
6. **September.** APAAR coverage per class and who is missing, with 30 September on the screen.

Plus the two-minute answer to "is this legal", and the one-line answer to "what happens to my data
if you disappear" — which is Flanca's full export, and it already exists.

*Exit:* the demo runs twice, cold, without you touching a terminal.

### Phase 8 — The school · ~2 days plus their calendar

Principal, two teachers, three parents, the owner. Not one meeting — a teacher who has been told
about it by another teacher is worth more than any demo. Ask for a pilot with one class and one
subject, priced, with a written scope. Not a free trial: a free trial of a product like this has no
one accountable for it inside the school, and it dies quietly.

*Exit:* a signed pilot, or a specific reason it was refused. Either is a result; "they seemed
interested" is not.

### Sequencing

```
Phase 0  decisions ─┬─► 1  deploy + measure ──► 2  browser-drive ──► 3  tenancy ──► 4  provisioning
                    │                                                                     │
                    └─► DPDP legal opinion (longest lead — start day one) ─────────┐       ▼
                                                                                  └──► 5  the loop
Phase 6  content authoring (parallel from Phase 1, editorial not engineering) ─────────► 7  demo ──► 8  school
```

**~37 focused working days to a demo**, of which 6 are editorial and 2 are decisions. Phase 6 runs
in parallel with 1–5, so calendar time is shorter than the sum — but only if the content is somebody
else's job, or you accept a genuine break from code to write it.

---

## 6. The two things most likely to go wrong

**The pricing turns out to be a subsidy.** Everything in §2 rests on a per-active-student cost that
has never been measured against a paid key at school scale. If a school-wide roll of 600 children
produces 200 heavy users rather than 40, the ₹1,200/child/yr number moves and the pitch in §2.1
moves with it. This is why Phase 1 measures before Phase 8 sells, and why nothing here should be
quoted to a school before that number exists.

**The content gap becomes visible in the meeting.** A principal will test the tutor on the chapter
his own child is failing, which will not be one of the six you authored. The answer is not to bluff
it: say the syllabus is being authored chapter by chapter, show which are done, and let the school
pick the next ones. A school that chooses the next four chapters has committed something.

---

## 7. What is already true, and worth not re-deriving

- Flanca: 39 commits, ~42k lines, 63 routes, 428 tests green, `tsc` clean. A school can go from
  empty database to raised invoices with nobody touching Postgres. Not deployed. Not driven.
- AI Tutor: 80 commits, ~60k lines across two packages, 47 models, seven modes, both typechecks
  clean. Zero tests. Not deployed. Barely driven. Content-starved. Fork ownership unresolved.
- Both are further along than either doc admits, and both are stuck at the same place: **nothing has
  met a real person.** That is what this plan is for.
