# School Management System

Multi-tenant school management for Ghanaian schools, built with **Next.js 16**, **React 19**, **Tailwind** and **Supabase** (Postgres, Auth, row-level security).

## Modules

| Module | What it does | Route |
| --- | --- | --- |
| Schools, roles, permissions | Tenant isolation by `school_id`, role-based permissions enforced by RLS | `/schools/[slug]/admin` |
| Academics | Years, terms, classes, streams, subjects, enrolments | `/academics/*` |
| Students & staff | Directory, guardians, registration | `/students`, `/staff` |
| Attendance | Daily roll call by class | `/attendance` |
| **Timetable** | Periods, weekly class/teacher grids, teacher and room clash prevention | `/timetable` |
| **Grades & reports** | Grading scale, weighted assessments, score entry, locking, rankings, printable report cards | `/grades` |
| **Fees & finance** | Fee structure, bulk invoice generation, payments with printable receipts, arrears, expenses | `/fees` |
| **Communication** | Announcements, SMS outbox (absence alerts, fee reminders, custom) | `/communication` |
| **Library** | Catalogue, lending with copy availability, returns and fines | `/library` |
| **HR & payroll** | Leave requests and approval, pay setup, monthly payroll runs, payslips | `/hr` |
| **Reports** | Enrolment, attendance, finance and grade summaries for a date range | `/reports` |
| **Online payments** | Parents pay invoices by mobile money or card (Paystack); verified webhooks create receipts automatically | `/portal`, `/fees` |
| **Transport** | Routes, vehicles with seat limits, student assignments | `/transport` |
| **Hostel** | Hostels, rooms, bed allocation with gender and capacity rules | `/hostel` |
| **ID cards** | Printable student and staff ID cards with QR codes | `/id-cards` |
| **Accounting export** | Balanced double-entry journal, payments, invoices, expenses and payroll as CSV | `/fees` |
| **Offline mode** | Attendance and score entry keep working without a connection and sync later; installable on phones | `/attendance`, `/grades` |
| **Family portal** | Parents and students see their linked children's attendance, fees, results and notices | `/portal`, `/portal/access` |

## Setup

```bash
npm install
cp .env.example .env.local   # or create it with the variables below
npm run dev
```

| Variable | Purpose |
| --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Supabase publishable (anon) key |
| `SUPABASE_SERVICE_ROLE_KEY` | Server only. Needed by the Paystack webhook/callback to record verified payments. Never expose it to the browser |
| `PAYSTACK_SECRET_KEY` | Server only. Enables online payments (initialize, verify, webhook signature check) |
| `NEXT_PUBLIC_SITE_URL` | Public site URL used for the Paystack return link, e.g. `https://yourschool.example` |
| `ARKESEL_API_KEY` | Optional. Enables real SMS sending through Arkesel. Without it SMS are marked `simulated` |
| `SMS_SENDER_ID` | Optional. Sender name shown on SMS (max 11 characters, default `School`) |
| `WHATSAPP_TOKEN`, `WHATSAPP_PHONE_NUMBER_ID`, `WHATSAPP_TEMPLATE_NAME` | Optional. Enable WhatsApp Cloud API sending (template with one body variable). `WHATSAPP_TEMPLATE_LANG` defaults to `en` |

## Database

Migrations live in `supabase/migrations` and run in filename order. Apply them with the Supabase CLI:

```bash
supabase link --project-ref <your-project-ref>
supabase db push
```

The new modules are migrations `CODE 031` to `CODE 042` (`20261017000100` … `20261018000400`). They add permissions and assign them to the existing roles (`proprietor`, `school_admin`, `head_teacher`, `teacher`, `bursar`, `librarian`, `parent`, `student`), so users only see the modules their role allows.

### Who can do what (new modules)

| Role | Access |
| --- | --- |
| proprietor, school_admin | Everything, including payroll and portal access |
| head_teacher | Grades, timetable, communication, leave decisions; read fees, library, reports |
| teacher | Enter scores, read timetable/library/communication, request own leave |
| bursar | Fees and finance (full), payroll, read communication, reports |
| librarian | Library (full), request own leave |
| parent, student | Read-only family portal for linked students only |

### Design rules worth knowing

- Money is stored as integer pesewas (never decimals). Payments and invoice lines are append-only; a payment can never exceed the invoice balance.
- Invoice generation is idempotent: re-running it never double-bills a student for a term.
- Assessment weights per subject and term cannot exceed 100%; scores cannot exceed the maximum; locked assessments reject edits.
- Teacher and room double-booking are blocked by unique indexes, not just UI checks.
- Payroll runs can only move `draft → approved → paid`; payslips are locked once approved. Salaries are visible only with `payroll.read`.
- Portal users are linked to specific students (`portal_links`) and can only read those students' rows.

## Tests

`supabase/tests/modules_rls.sql` contains 94 behavioural checks (permissions, tenant isolation, money rules, clash detection, portal visibility). Run it against any database where all migrations are applied (use a throwaway database, the script rolls back its changes):

```bash
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/tests/modules_rls.sql
```

`npm run test:unit` runs the offline-queue tests (replay order, network failure handling, user isolation). Also run `npm run lint` and `npm run build` before deploying.

## Online payments (Paystack)

1. Create a Paystack account for the platform, and a **subaccount** for each school that should receive its own fees.
2. Set `PAYSTACK_SECRET_KEY`, `SUPABASE_SERVICE_ROLE_KEY` and `NEXT_PUBLIC_SITE_URL` on the server.
3. In the Paystack dashboard set the webhook URL to `https://<your-domain>/api/payments/paystack/webhook`.
4. In **Fees → Online payments**, a bursar or admin enters the school's subaccount code (`ACCT_...`) and turns payments on.
5. Parents then see **Pay online** next to unpaid invoices in the family portal.

Safety rules built in: the browser never records a payment. A payment row is created only after the server confirms it with Paystack (webhook signature or direct verification), the amount must match exactly, repeats are ignored, and a payment that arrives after the invoice was settled another way is flagged **Needs review** for a refund instead of being applied. Hubtel is not integrated; Paystack accepts MTN, Telecel and AirtelTigo mobile money and cards.

## SMS and WhatsApp

`POST /api/sms/dispatch` sends up to 50 queued messages per call using the signed-in user's permissions (it can only send for schools where the user holds `communication.manage`). SMS uses Arkesel; WhatsApp uses the Meta Cloud API with an approved template that has exactly one body variable. Both integrations follow the providers' documented APIs but have **not been tested against live accounts**: send one real message to yourself first.

## Offline mode

Open the Attendance or Grades page once while online; after that it also opens without a connection, using the last data it loaded (kept at most 7 days). Marks and scores entered offline are stored on the device and sent automatically when the connection returns; a banner shows what is waiting. Changes the server rejects (for example a score above the maximum, or lost permission) are listed for review instead of being lost. Cached data is cleared on sign-out and whenever a different user signs in on the same device.

## Known limits

- ID cards show initials, not photos (students and staff have no photo field yet).
- Offline sync is last-write-wins per student per day (attendance) and per student per assessment (scores).
- Parents do not yet see transport or hostel details for their children.
- Accounting export is CSV based; there is no direct API link to accounting software.
