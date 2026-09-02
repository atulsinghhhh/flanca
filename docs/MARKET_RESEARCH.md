# simplifiedSMS — Market Research (19 Aug 2026)

Research pass for a standalone school management product aimed at **500–1,500-student private
schools in India**. Sources are listed per section. Confidence is marked, because a lot of Indian
school-ERP "pricing pages" are vendor blogs comparing themselves favourably to rivals — useful for
the *shape* of the market, not gospel on any single rival's number.

---

## 1. The market is large, growing, and moving toward us

| Fact | Number | Confidence |
|---|---|---|
| Private unaided recognised schools (2025-26) | **~3,42,000** (+~15,000 net in one year) | High — UDISE+ |
| Students in private unaided schools | **9.89 crore** (up from 9.00 cr in 2023-24) | High |
| Share of all Indian schoolchildren in private schools | **4 in 10** (was 35.4% in 2018-19) | High |
| Total school system | 24.7 crore students, ~14.7 lakh schools, ~98 lakh teachers | High |
| Govt school enrolment | **falling** (12.75 cr → 11.89 cr); 8,000+ govt schools closed in a year | High |

Read: the paying customer base is the one that is *growing*, and it is growing fastest at
pre-primary/primary (71% of pre-primary, 40% of primary is private) — exactly the small-school band.

Even at a modest ₹8,000/yr, 3.42 lakh private schools ≈ **₹2,700 crore/yr** of addressable spend on
the admin spine alone, before fee-rail or comms revenue.

## 2. Pricing — where the floor actually is

Two distinct pricing worlds:

**World A — the incumbents (quote-only, per-student, enterprise sales):**

| Vendor | Reported price | Notes |
|---|---|---|
| Entab CampusCare | **₹30–80 per student/month** (third-party estimate); official page publishes *no* numbers | For 800 students that's ₹2.9L–7.7L/yr. Criticised for "lengthy implementation, pricing not transparent", "limited customization, slow support" |
| Fedena | ₹25,000–40,000+/yr cloud; self-host free | Indian-specific features (UPI, WhatsApp) are **add-ons**; "dated UI" |
| MyClassboard / MyClassCampus | Per-student, ₹15,000–30,000+/yr | Strong in AP/Telangana; weak Hindi, weak north-India board formats, "basic UI" |
| Edunext, Vidyalaya | Subscription / custom per-student | "Complex setup, dated interface, expensive for small schools" |
| Classe365 | ₹1,500+/month | "Some features still being developed" |

Entab's own price page is the tell: it lists *price factors* and offers a demo call. **Nobody at the
top of this market will show a school a price.**

**World B — the flat-fee disruptors (the real competition for us):**

| Vendor | Price (excl. GST) | What's included |
|---|---|---|
| **EduGradUP** | **₹9,000** (≤150) · **₹14,000** (150–350) · **₹17,000** (350–700) · **₹23,000** (700–1,500) | "All 43 modules", parent/teacher/student apps, **6 languages** (En/Hi/Mr/Ta/Te/Ur), 8 payment gateways, **free setup + training**, **free data migration**, 15-day free trial, 15-day money-back, offline-capable app. WhatsApp billed separately (₹1,000 = 4,000 credits ≈ ₹0.25/msg). 12% off for 2-year prepay |
| Pathshala ERP | ₹15,000/yr flat, unlimited students | "All 25+ modules", WhatsApp, UPI, Hindi, free implementation + training, 2-week implementation, 15-day trial |
| MySmartSchool | claims **₹5/student/month** | 50+ modules |
| Skoolz | freemium | "limited scalability and support quality at free tier" |

**Conclusion: the price bar for our target band (500–1,500 students) is ₹17,000–23,000/yr**, and it
already includes free migration, free training, multi-language and a money-back guarantee. Anyone
planning to win on "cheaper" has to clear *that*, not Entab's ₹3 lakh.

Also documented: advertised prices run **40–60% below true first-year cost** once setup, training,
SMS packs, gateway fees and customisation land. That gap is itself a wedge — an all-in price with
nothing bolted on afterwards.

## 3. The biggest single event in this market: Teachmint exited school ERP

Multiple sources report Teachmint **shut down its school ERP service from April 2026** and pivoted to
classroom hardware (Teachmint X digital board, Click X clickers). Its product pages no longer present
a standalone ERP / fee / SIS product. Entry-level ERP pricing had reportedly reached ₹1,50,000.

Two implications, both large:

1. **A stranded-school pipeline exists right now.** Schools that trusted a funded, well-marketed
   platform have to move, and their #1 fear (below) has already come true once. A credible
   "we will migrate you off Teachmint, free, this week" offer has urgency no feature list can buy.
2. **It is evidence for our business model, not against it.** A well-funded player could not make
   seat-priced school ERP work in India. That supports near-free distribution + monetising the rail
   and the depth, and it is a sharp answer to "why hasn't someone already won this?"

*Caveat: this comes from secondary sources (comparison blogs) and Teachmint's own site no longer
listing ERP. Confirm directly before putting it on a slide.*

## 4. Why schools don't switch — and what they hate about what they have

**The #1 reason schools don't switch is fear of data loss.** Not price, not features. Everything about
onboarding has to be built around killing that fear.

Documented failure modes:
- Implementation is run "like a purchase, not a change program" — no training, no parallel run, bad data quality.
- Vendors "don't understand the unique needs of Indian schools"; no dedicated implementation support.
- Teachers find the software **"heavy"**.

**Teacher complaints, verbatim from the research — these are product requirements, not gripes:**
- **"5 clicks to mark attendance"**, **"15 minutes to find a student's fee status."**
- Servers **overload at attendance time** because every teacher marks at once; teachers who already
  marked show as absent and have to re-mark. Real protests over this in UP and Punjab.
- Poor rural connectivity makes timed attendance windows punitive.
- Teachers describe being turned into **data-entry operators**, pulled away from teaching, juggling
  multiple mandated apps plus Google Sheets.

**Parent-app complaints** cluster on the same five: crashes, login problems, payment failures, battery
drain, missing features — and tabs for *fees* disappearing after updates. Market ratings are low
(prior research: CampusCare ~3.3★, Skolaro 2.29★).

Translation: **speed, offline tolerance and reliability ARE the product.** A system where attendance
is one tap, works with no signal, and never loses a mark, beats a 43-module checklist.

## 5. Compliance is a forcing function — and the clock is running now

**APAAR (the hard one, this term):**
- APAAR ID is **mandatory for every enrolled student, Class 1–12, in 2026-27.**
- UDISE+ reference date / certification freeze: **30 September 2026** — student progression, new
  admissions, APAAR IDs, school profile, teacher module all frozen by then.
- **Students without an APAAR ID block the school's data certification.** Hard requirement.
- Progression was due Jun–Jul 2026; APAAR generation "by August 2026". **Schools are inside this
  window right now, and many are behind.**
- Parent consent must be collected *before* generating APAAR IDs; generation commonly fails on
  Aadhaar name mismatch and OTP delivery.

A product that tracks APAAR coverage per class, flags the missing ones, manages consent capture and
handles name-mismatch retries is worth more to a principal in September 2026 than any AI feature.

**DPDP (the one nobody has prepared for):**
- Verifiable parental consent required before processing any under-18 personal data, **including
  photos and videos** — a tick-box on an admission form does not qualify; needs real verification
  (DigiLocker-grade).
- Consent Manager framework operational **13 Nov 2026**; broader obligations by **mid-May 2027**.
- No tracking, profiling or targeted advertising at students.
- Children's-data penalty: **up to ₹200 crore.**

Schools are data fiduciaries here and mostly don't know it. Consent-as-a-feature is a real moat and a
reason a principal calls *us*.

**HPC / report cards:**
- The shift from marks-based cards to Holistic Progress Cards (NEP 2020 / PARAKH / CBSE prototypes,
  stage-wise, with teacher + parent + peer + self inputs) is underway, and an entire cottage industry
  of "HPC report card software" has sprung up to service it.
- Report cards are the recurring terminal panic in every school. Printable, board-correct, one-click
  is a buying trigger.

## 6. The fee rail — what's true as of now

- RBI/NPCI have approved **direct UPI fee collection by institutions, up to ₹5 lakh per transaction**;
  the Ministry of Education is pushing states to adopt UPI for school fees.
- **UPI MDR is still zero.** The Taxation Bill removed the legal barrier to charging MDR on notified
  modes, but UPI stays free until fresh rules; a 0.25–0.4% rate has been floated for large merchants,
  undecided.
- Aggregator-routed education payments are getting taxed: SBI Card levies **1% on education payments
  made through payment aggregators/apps — but nothing when paid directly to the institution.**
- Meanwhile parents are charged **up to 2% convenience fee** on some fee-payment platforms.

So: **"pay the school directly by UPI, ₹0 extra, no convenience fee"** is currently true, cheap for us
to deliver, aligned with government policy, and directly attacks the market's #1 parent complaint.
Card/netbanking still carries MDR and should be shown honestly as such.

## 7. Feature checklist war — what "43 modules" actually contains

The flat-fee players advertise 25–50 "modules". In practice the list is padded (notice board, gallery,
holiday list, and so on each count as a module). The ones that recur across every vendor and that
schools actually name as buying reasons:

fee collection + online payment · attendance with parent alerts · exams, marks, and **report card
generation** · parent communication (WhatsApp/SMS/app) · student information / admissions ·
certificates (TC, bonafide) · timetable · staff attendance and payroll · transport · library ·
homework · UDISE/board reporting · MIS reports for the principal · Hindi/regional interface ·
mobile apps for parent/teacher/student.

Padding we can ignore without being noticed: hostel, inventory, alumni, visitor management, gallery,
polls, GPS bus tracking (needs hardware), biometric device integration (needs hardware).

## 8. What this all implies (carried into PLAN.md)

1. Undercut **World B (₹17–23k)**, not World A — and undercut it with a **free tier they cannot
   follow**, because their cost structure includes a human implementation.
2. **Migration is the hero feature**, not a footnote. Fear of data loss is the actual competitor.
3. **Ship speed and offline as the headline.** "One tap. No signal needed. Never lost." Every
   documented teacher complaint is a click count or a dropped connection.
4. **Own the September 2026 APAAR crunch** as the reason to talk to us this month.
5. **Own DPDP consent** as the reason a principal fears staying where they are.
6. **Publish the price.** Nobody in World A does. Transparency is differentiation here.
7. **Zero convenience fee, direct-to-school UPI** — true today, policy-aligned, attacks the loudest
   parent grievance.
8. **Teachmint's exit is the opening** — both a pipeline and the answer to "why now".

---

## Sources

Pricing & competitive landscape:
- https://schoolsoftwareindia.com/pricing
- https://schoolsoftwareindia.com/blog/best-school-management-software-india/
- https://pathshalaerp.in/blog/best-school-management-software-india
- https://codingclave.com/blog/best-school-management-software-india
- https://mysmartschool.co.in/top-7-affordable-school-erp-software/
- https://mysmartschool.co.in/best-teachmint-alternative-school-erp-system/
- https://www.entab.in/school-management-software-price.html
- https://campusonclick.co.in/blog/school-erp-software-pricing-in-2026
- https://vapstech.com/how-much-does-school-erp-software-cost-in-india/
- https://www.softwaresuggest.com/teachmint
- https://www.trustradius.com/products/teachmint/pricing
- https://edunodex.in/blog/edunodex-vs-teachmint-comparison-2026

Market size:
- https://www.pib.gov.in/PressReleasePage.aspx?PRID=2097864
- https://www.freepressjournal.in/education/udise-2025-26-report-government-schools-lose-nearly-86-lakh-students-as-private-schools-gain-over-88-lakh-enrolments
- https://www.newslaundry.com/2026/08/17/why-4-in-10-indian-children-go-to-private-schools
- https://factly.in/public-school-enrolment-falls-as-private-schools-expand/

Compliance:
- https://theudiseplus.org.in/blog/apaar-id-udise-plus-2026-27.php
- https://udise.net/udise-plus-deadline-tracker-2026-27/
- https://www.egovtschemes.com/udise-plus-login/
- https://campusfeed.in/dpdp-act-schools-child-data-privacy/
- https://www.orfonline.org/english/expert-speak/dpdp-rules-and-the-future-of-child-data-safety
- https://ksandk.com/data-protection-and-data-privacy/dpdp-act-compliance-for-edtech-schools/
- https://www.privybyidfy.com/blog/dpdp-compliance-guide-2026-what-indian-enterprises-must-do-before-may-2027
- https://cbseacademic.nic.in/web_material/Manuals/HPC_TeacherGuide.pdf
- https://www.myleadingcampus.com/blogview/holistic-progress-report-card-nep-2020-format-examples-challenges-how-schools-can-actually-implement-it-guide-for-schools-2026/

Switching friction & user complaints:
- https://www.iitms.co.in/blog/mistakes-educators-do-while-implementing-education-erp.html
- https://easyedulab.com/blog/2026/02/school-software-implementation-mistakes-fixes
- https://www.edumerge.com/blog/ease-of-use-school-erp
- https://www.tribuneindia.com/news/jalandhar/teachers-cry-foul-over-mstar-app-seek-relief-from-attendance-burden/
- https://theprint.in/india/necessary-or-too-harsh-whats-behind-the-govt-teacher-tussle-over-ups-digital-attendance-rule/2178424/
- https://synthesys.co.in/erp-adoption-challenges-education-faculty-resistance/

Fee rail:
- https://razorpay.com/blog/convenience-fee-tdr-mdr-platform-fee-amc-setup-fee-technology-fee-of-payment-gateway/
- https://www.forbesindia.com/article/news/what-is-merchant-discount-rate-on-upi-and-why-does-india-want-to-bring-it-back/2996894/1
- https://www.billcut.com/blogs/upi-for-schools-and-fees-whats-changing/
- https://www.business-standard.com/finance/personal-finance/sbi-card-to-charge-1-on-wallet-top-ups-app-based-education-payments-125103000829_1.html
