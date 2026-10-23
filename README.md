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
| `ARKESEL_API_KEY` | Optional. Enables real SMS sending through Arkesel. Without it messages are marked `simulated` |
| `SMS_SENDER_ID` | Optional. Sender name shown on SMS (max 11 characters, default `School`) |

## Database

Migrations live in `supabase/migrations` and run in filename order. Apply them with the Supabase CLI:

```bash
supabase link --project-ref <your-project-ref>
supabase db push
```

The new modules are migrations `CODE 031` to `CODE 038` (`20261017000100` … `20261017000800`). They add permissions and assign them to the existing roles (`proprietor`, `school_admin`, `head_teacher`, `teacher`, `bursar`, `librarian`, `parent`, `student`), so users only see the modules their role allows.

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

`supabase/tests/modules_rls.sql` contains 65 behavioural checks (permissions, tenant isolation, money rules, clash detection, portal visibility). Run it against any database where all migrations are applied (use a throwaway database, the script rolls back its changes):

```bash
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/tests/modules_rls.sql
```

Also run `npm run lint` and `npm run build` before deploying.

## SMS sending

`POST /api/sms/dispatch` sends up to 50 queued messages per call using the signed-in user's permissions (it can only send for schools where the user holds `communication.manage`). The Arkesel call follows their v2 API but has **not been tested against a live account**; send one real message to yourself first.

## Not built yet

Online payment collection (Paystack / Hubtel MoMo checkout and webhooks), WhatsApp messages, offline-first attendance and score entry, transport and hostel management, ID cards, and accounting exports.
