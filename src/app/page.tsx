import Link from "next/link";
import AuthRedirect from "@/components/auth/AuthRedirect";

const features = [
  "Students, staff, classes and attendance",
  "Grades, report cards and timetables",
  "Fees, receipts and online payments",
  "SMS and WhatsApp alerts to parents",
  "Library, transport and hostel",
  "Payroll, reports and a parent portal",
];

export default function Home() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center bg-slate-50 px-6 py-16">
      <AuthRedirect />
      <div className="w-full max-w-2xl text-center">
        <p className="text-sm font-semibold uppercase tracking-widest text-blue-800">School Management System</p>
        <h1 className="mt-3 text-4xl font-bold text-slate-900">Run your whole school in one place</h1>
        <p className="mt-4 text-lg text-slate-600">Admissions to report cards, fees to payroll, built for schools in Ghana.</p>
        <div className="mt-8 flex flex-wrap justify-center gap-3">
          <Link href="/login" className="rounded-xl bg-blue-800 px-6 py-3 font-semibold text-white hover:bg-blue-900">Sign in</Link>
          <Link href="/register-school" className="rounded-xl border border-slate-300 bg-white px-6 py-3 font-semibold text-slate-800 hover:bg-slate-100">Register your school</Link>
        </div>
        <ul className="mx-auto mt-12 grid max-w-xl gap-3 text-left sm:grid-cols-2">
          {features.map((f) => (
            <li key={f} className="rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-700">{f}</li>
          ))}
        </ul>
      </div>
    </main>
  );
}
