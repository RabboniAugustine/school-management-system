import { Suspense } from "react";
import Link from "next/link";

import DashboardLayout from "@/components/layout/DashboardLayout";

import { requireSchoolAccess } from "@/lib/permissions/requireSchoolAccess";

interface PageProps {
  params: Promise<{
    slug: string;
  }>;
}

export default function SchoolDashboardPage({
  params,
}: PageProps) {
  return (
    <Suspense fallback={<DashboardLoading />}>
      <DashboardContent params={params} />
    </Suspense>
  );
}

function DashboardLoading() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-50">
      <div className="text-center">
        <div className="mx-auto h-12 w-12 animate-spin rounded-full border-4 border-blue-100 border-t-blue-800" />

        <p className="mt-5 text-slate-600">
          Loading your dashboard...
        </p>
      </div>
    </main>
  );
}

async function DashboardContent({
  params,
}: PageProps) {
  const { slug } = await params;

  const {
    school,
    user,
    roles,
  } = await requireSchoolAccess(slug);

  const isAdministrator = roles.some((role) =>
    ["proprietor", "school_admin"].includes(role.code)
  );

  const dashboardUrl =
    `/schools/${encodeURIComponent(school.slug)}`;

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
      <div className="space-y-8">

        {/* Welcome */}

        <section>
          <p className="text-sm font-semibold text-blue-700">
            SCHOOL WORKSPACE
          </p>

          <h1 className="mt-3 text-3xl font-bold tracking-tight text-slate-900">
            Welcome to {school.name}
          </h1>

          <p className="mt-3 text-slate-600">
            Your school management workspace is ready.
          </p>
        </section>

        {/* Information Cards */}

        <div className="grid gap-6 md:grid-cols-3">

          <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
            <p className="text-sm text-slate-500">
              School Status
            </p>

            <p className="mt-3 text-2xl font-bold text-green-700">
              Active
            </p>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
            <p className="text-sm text-slate-500">
              Your Assigned Roles
            </p>

            <p className="mt-3 text-2xl font-bold text-slate-900">
              {roles.length}
            </p>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
            <p className="text-sm text-slate-500">
              School Identifier
            </p>

            <p className="mt-3 break-all font-semibold text-blue-800">
              {school.slug}
            </p>
          </div>

        </div>

        {/* Roles */}

        <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <h2 className="text-xl font-bold text-slate-900">
            Your School Roles
          </h2>

          <div className="mt-5 flex flex-wrap gap-3">
            {roles.map((role) => (
              <span
                key={role.id}
                className="rounded-full bg-blue-100 px-4 py-2 text-sm font-semibold text-blue-800"
              >
                {role.name}
              </span>
            ))}
          </div>
        </section>

        {/* Administrator Access */}

        {isAdministrator && (
          <section className="rounded-2xl border border-blue-200 bg-blue-50 p-6">
            <h2 className="text-xl font-bold text-blue-900">
              School Administration
            </h2>

            <p className="mt-3 text-blue-800">
              Access your school administration workspace.
            </p>

            <Link
              href={`${dashboardUrl}/admin`}
              className="mt-5 inline-flex rounded-xl bg-blue-800 px-6 py-3 font-semibold text-white hover:bg-blue-900"
            >
              Open Administration
            </Link>
          </section>
        )}

      </div>
    </DashboardLayout>
  );
}