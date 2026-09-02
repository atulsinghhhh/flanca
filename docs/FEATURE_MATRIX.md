# Flanca — Feature Matrix vs the Category

*Compiled 19 Aug 2026 from the advertised module lists of Fedena (60 modules across 4 tiers), Entab
CampusCare, Edunext, schoolerp.org, EduGradUP ("43 modules"), Pathshala ("25+"), MySmartSchool ("50+").*

**Rule for this product: we ship the union of what they advertise, minus only what needs hardware we
don't sell — and then we ship the eight things none of them have.**

## Part 1 — The checkbox war (everything they advertise)

| Competitor module | Who advertises it | Flanca |
|---|---|---|
| Admission / enquiry / online registration | all | ✅ + public application portal with status tracking |
| Student information / profile + history | all | ✅ |
| Classes, sections, courses & batches | all | ✅ |
| Promotion / year rollover | Entab, schoolerp.org | ✅ |
| Student documents & verification | Entab | ✅ |
| ID card generator | Fedena, Edunext (RFID) | ✅ print-ready, no hardware needed |
| Certificate generator (TC, bonafide, character) | Fedena, Entab | ✅ + gap-free serial numbers + public verification |
| Discipline / conduct / custom remarks | Fedena | ✅ |
| Alumni | Fedena (Ultimate tier) | ✅ basic register |
| Student attendance (daily + period) | all | ✅ **one tap, offline-first** |
| Staff attendance + leave | all | ✅ |
| Biometric / RFID attendance | Fedena, Edunext | ⛔ hardware — we import their CSV instead |
| Fee structures, term-wise + head-wise | all | ✅ |
| Concessions / waivers + approval | schoolerp.org, Edunext | ✅ |
| Installments | Entab | ✅ |
| Instant fees / counter collection + receipts | Fedena, all | ✅ |
| Online payment gateway | all | ✅ **UPI direct, ₹0 convenience fee** |
| Fee dues, overdue reminders, defaulter reports | all | ✅ + WhatsApp reminder with pay link |
| Fees import | Fedena (Premium) | ✅ |
| Accounting: vouchers, ledgers, trial balance, P&L | schoolerp.org, Edunext | ✅ day-book + ledgers + closeout (not full double-entry) |
| Tally / QuickBooks export | Fedena (Premium/Ultimate) | ✅ export format |
| Examination management + shifts | all | ✅ |
| Marks entry by subject | all | ✅ **spreadsheet-speed grid, offline** |
| Gradebook / grading schemes | Fedena, all | ✅ |
| Report card printing | all | ✅ board-correct, print-perfect |
| Holistic Progress Card (HPC / NEP) | Entab only | ✅ PARAKH-aligned, with parent + self inputs |
| Rank lists, result analysis | all | ✅ |
| Online examination | Fedena (Ultimate) | ⛔ that's testWest — graduation path |
| Timetable | all | ✅ |
| Automatic timetable generator | Fedena (Ultimate) | ✅ assisted generator with clash detection |
| Lesson planning | Edunext | ✅ |
| Homework / assignments | Fedena (Premium), Edunext | ✅ |
| SMS integration | all | ✅ |
| Email integration | Fedena | ✅ |
| WhatsApp Business API | EduGradUP, Pathshala, Edunext | ✅ |
| Messaging / circulars / news / notice board | all | ✅ |
| School calendar & events | all | ✅ |
| Reminders | Fedena (Premium) | ✅ |
| Blog / poll / discussion / gallery | Fedena, Edunext | ✅ notices + gallery (poll/blog = padding, skipped) |
| Human resources / staff records | all | ✅ |
| Payroll + salary slips | all | ✅ salary register + slips (not statutory filings) |
| Recruitment / vacancies | Edunext | ⛔ padding for this segment |
| Task / KRA management | Fedena, Edunext | ✅ staff task list |
| CPD hour tracking (NEP) | Entab | ✅ |
| Library (categories, issue, return, fines) | Fedena, Edunext, schoolerp.org | ✅ **in** — ISBN lookup, issue/return, fines |
| Hostel / mess | Fedena, schoolerp.org | ✅ rooms, allotment, night attendance, mess menu |
| Transport: routes, stops, charges | all | ✅ (fee-linked) |
| Transport GPS / bus tracking | Entab, Edunext | ⛔ hardware — stop-level ETA notices instead |
| Inventory / stock / goods-in | Fedena, schoolerp.org, Edunext | ✅ |
| Asset management, AMC, insurance | schoolerp.org | ✅ |
| Gate / visitor management | Fedena (Ultimate), Edunext | ✅ visitor log + gate pass |
| Parent portal + app | all | ✅ PWA, offline-tolerant |
| Student portal + app | all | ✅ |
| Teacher portal + app | all | ✅ |
| Principal / admin dashboard | all | ✅ |
| Role-based logins + module-level permissions | all | ✅ form-level granularity |
| Report centre / custom reports | Fedena, schoolerp.org | ✅ + saved report builder |
| Data export | Fedena (Premium) | ✅ **one-click full-school export, always free** |
| Custom import | Fedena (Standard) | ✅ **Excel/CSV with preview-and-approve** |
| Doc manager | Fedena (Ultimate) | ✅ |
| Form builder | Fedena (Premium) | ✅ |
| Audit log | Fedena (Ultimate) | ✅ on every write |
| Google SSO | Fedena (Premium) | ✅ |
| Google Meet / Zoom / BBB | Fedena, Edunext | ✅ link-attach on timetable (no video hosting) |
| Multi-language UI | EduGradUP (6), Pathshala | 🔜 English v1, architecture i18n-ready |

Counted the way they count: **~55 modules shipped**, against Fedena's 60 spread over four paid
tiers and EduGradUP's 43. Everything in one price, nothing gated.

## Part 2 — What nobody in the category has (the real product)

1. **Live in an afternoon.** Self-serve provisioning; competitors take 2–8 weeks with an
   implementation visit. Proven code already exists in schoolOS Command.
2. **Migration you watch happen.** Excel/CSV import with a full preview, per-row validation, an
   approve step, and a one-click undo. Fear of data loss is the #1 reason schools don't switch;
   nobody else lets a principal *see* the import before it lands.
3. **Offline-first where teachers work.** Attendance and marks queue locally and sync. Documented
   competitor failure: servers collapse at 9am, teachers show as absent after marking, rural
   connectivity makes timed windows punitive, real protests in UP and Punjab.
4. **Speed as a contract.** ≤1 tap per absent student, any student's fee status in ≤3 seconds, a whole
   class's report cards in one action. Against the market's "5 clicks to mark attendance" and
   "15 minutes to find a fee status."
5. **APAAR command centre.** Per-class coverage, the missing-student list, consent capture, and an
   Aadhaar name-mismatch retry queue — against a hard 30 Sept 2026 certification freeze that blocks
   schools whose students lack IDs. No competitor advertises this at all.
6. **DPDP consent register.** Verifiable parental consent for under-18 data including photos, consent
   receipts, withdrawal handling, retention rules. ₹200 crore exposure and nobody has built it.
7. **Honest money.** Itemised head-wise invoices, and UPI paid direct to the school at **₹0
   convenience fee** — against a market that charges parents up to 2% and hides the breakdown.
8. **A public front door.** School page with admission enquiry and application, published fee
   structure, notices, calendar, and public certificate verification. Everyone else stops at a
   parent login; this brings the school admissions.

Plus two standing guarantees that cost us nothing and kill the two big objections: **your data exports
in one click, always** and **every write is audited and reversible.**
