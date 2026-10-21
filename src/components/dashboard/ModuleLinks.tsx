import Link from "next/link";

const modules = [
  { label: "Academic calendar", path: "academics/years", permission: "academics.read" },
  { label: "Classes & streams", path: "academics/classes", permission: "classes.read" },
  { label: "Subjects", path: "academics/subjects", permission: "subjects.read" },
  { label: "Student directory", path: "students", permission: "students.read" },
  { label: "Staff", path: "staff", permission: "staff.read" },
  { label: "Enrollments", path: "academics/enrollments", permission: "enrollments.read" },
  { label: "Attendance", path: "attendance", permission: "attendance.read" },
];

export default function ModuleLinks({ slug, permissions }: {
  slug: string;
  permissions: Set<string>;
}) {
  const base = `/schools/${encodeURIComponent(slug)}`;
  const visible = modules.filter((m) => permissions.has(m.permission));
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
