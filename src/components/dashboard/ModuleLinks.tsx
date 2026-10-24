import Link from "next/link";

const modules: { label: string; path: string; permission: string | string[] }[] = [
  { label: "Academic calendar", path: "academics/years", permission: "academics.read" },
  { label: "Classes & streams", path: "academics/classes", permission: "classes.read" },
  { label: "Subjects", path: "academics/subjects", permission: "subjects.read" },
  { label: "Student directory", path: "students", permission: "students.read" },
  { label: "Staff", path: "staff", permission: "staff.read" },
  { label: "Enrollments", path: "academics/enrollments", permission: "enrollments.read" },
  { label: "Attendance", path: "attendance", permission: "attendance.read" },
  { label: "Timetable", path: "timetable", permission: "timetable.read" },
  { label: "Grades & reports", path: "grades", permission: "grades.read" },
  { label: "Fees & finance", path: "fees", permission: "fees.read" },
  { label: "Library", path: "library", permission: "library.read" },
  { label: "Transport", path: "transport", permission: "transport.read" },
  { label: "Hostel", path: "hostel", permission: "hostel.read" },
  { label: "ID cards", path: "id-cards", permission: "students.read" },
  { label: "Communication", path: "communication", permission: "communication.read" },
  { label: "HR & payroll", path: "hr", permission: ["hr.read", "payroll.read", "leave.request"] },
  { label: "Reports", path: "reports", permission: "reports.read" },
  { label: "My family", path: "portal", permission: "portal.read" },
  { label: "Portal access", path: "portal/access", permission: "portal.manage" },
];

export default function ModuleLinks({ slug, permissions }: {
  slug: string;
  permissions: Set<string>;
}) {
  const base = `/schools/${encodeURIComponent(slug)}`;
  const visible = modules.filter((m) =>
    (Array.isArray(m.permission) ? m.permission : [m.permission]).some((p) => permissions.has(p)));
  return (
    <nav aria-label="School modules" className="flex flex-wrap gap-2 border-b border-slate-200 pb-5">
      <Link href={`${base}/dashboard`} className="rounded-lg bg-slate-900 px-3 py-2 text-sm font-semibold text-white">Dashboard</Link>
      {visible.map((m) => (
        <Link key={m.path} href={`${base}/${m.path}`}
          className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100">
          {m.label}
        </Link>
      ))}
    </nav>
  );
}
