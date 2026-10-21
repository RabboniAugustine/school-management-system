import { Suspense } from "react";
import Link from "next/link";
import { notFound } from "next/navigation";

import DashboardLayout from "@/components/layout/DashboardLayout";
import SchoolStats from "@/components/dashboard/SchoolStats";

import { requireSchoolAccess } from "@/lib/permissions/requireSchoolAccess";

interface PageProps {
  params: Promise<{
    slug: string;
  }>;
}

export default function SchoolAdminPage({
  params,
}: PageProps) {
  return (
    <Suspense
      fallback={
        <div className="p-10 text-center text-slate-600">
          Loading administration...
        </div>
      }
    >
      <AdminContent params={params} />
    </Suspense>
  );
}

async function AdminContent({
  params,
}: PageProps) {
  const { slug } = await params;

  const {
    school,
    user,
    roles,
  } = await requireSchoolAccess(slug);

  // Server-side administrator authorization

  const allowedRoles = [
    "proprietor",
    "school_admin",
  ];

  const canAccessAdministration = roles.some(
    (role) => allowedRoles.includes(role.code)
  );

  if (!canAccessAdministration) {
    notFound();
  }

  const schoolBasePath =
    `/schools/${encodeURIComponent(school.slug)}`;

  const managementModules = [
    {
      title: "Academic Management",
      description:
        "Configure academic years, terms and school calendars.",
      icon: "📚",
      href: `${schoolBasePath}/academics/years`,
      available: true,
    },
    {
      title: "Student Management",
      description:
        "Manage student admissions and academic records.",
      icon: "🎓",
      href: "",
      available: false,
    },
    {
      title: "Staff Management",
      description:
        "Manage teachers and school employees.",
      icon: "👨‍🏫",
      href: "",
      available: false,
    },
    {
      title: "Finance Management",
      description:
        "Manage school fees, payments and financial records.",
      icon: "💳",
      href: "",
      available: false,
    },
    {
      title: "Attendance",
      description:
        "Monitor student and staff attendance.",
      icon: "📅",
      href: "",
      available: false,
    },
    {
      title: "Reports",
      description:
        "Access operational and academic reports.",
      icon: "📊",
      href: "",
      available: false,
    },
  ];

  return (
    <DashboardLayout
      school={{
        name: school.name,
        slug: school.slug,
      }}
      user={{
        email: user.email ?? "Authenticated User",
      }}
      roles={roles.map((role) => role.name)}
    >
      <div className="space-y-10">

        {/* PAGE HEADER */}

        <section>
          <p className="text-sm font-semibold uppercase tracking-wider text-blue-700">
            Administration
          </p>

          <h1 className="mt-3 text-3xl font-bold text-slate-900">
            School Administration
          </h1>

          <p className="mt-3 text-slate-600">
            Manage operations for {school.name}.
          </p>
        </section>

        {/* ADMINISTRATOR INFORMATION */}

        <section className="rounded-2xl border border-blue-200 bg-blue-50 p-6">
          <h2 className="text-xl font-bold text-blue-900">
            Administrator Workspace
          </h2>

          <p className="mt-3 text-blue-800">
            Signed in as {user.email}
          </p>

          <div className="mt-5 flex flex-wrap gap-2">
            {roles.map((role) => (
              <span
                key={role.id}
                className="rounded-full bg-white px-4 py-2 text-sm font-semibold text-blue-800"
              >
                {role.name}
              </span>
            ))}
          </div>
        </section>

        {/* LIVE SCHOOL STATISTICS */}

        <Suspense
          fallback={
            <div className="rounded-2xl border border-slate-200 bg-white p-8 text-center text-slate-500">
              Loading school statistics...
            </div>
          }
        >
          <SchoolStats schoolId={school.id} />
        </Suspense>

        {/* MANAGEMENT MODULES */}

        <section>
          <h2 className="mb-6 text-2xl font-bold text-slate-900">
            Management Modules
          </h2>

          <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-3">
            {managementModules.map((module) => (
              <article
                key={module.title}
                className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm"
              >
                <div className="text-4xl">
                  {module.icon}
                </div>

                <h3 className="mt-5 text-lg font-bold text-slate-900">
                  {module.title}
                </h3>

                <p className="mt-3 min-h-14 text-sm leading-6 text-slate-600">
                  {module.description}
                </p>

                {module.available ? (
                  <Link
                    href={module.href}
                    className="mt-6 inline-flex rounded-xl bg-blue-800 px-5 py-3 text-sm font-semibold text-white hover:bg-blue-900"
                  >
                    Open Module
                  </Link>
                ) : (
                  <span className="mt-6 inline-flex rounded-xl bg-slate-100 px-5 py-3 text-sm font-semibold text-slate-500">
                    Coming Soon
                  </span>
                )}
              </article>
            ))}
          </div>
        </section>

      </div>
    </DashboardLayout>
  );
}