import { Suspense } from "react";
import { notFound } from "next/navigation";

import DashboardLayout from "@/components/layout/DashboardLayout";

import AcademicCalendarManager from "@/features/academics/AcademicCalendarManager";

import { requireSchoolAccess } from "@/lib/permissions/requireSchoolAccess";

interface PageProps {
  params: Promise<{
    slug: string;
  }>;
}

export default function AcademicYearsPage({
  params,
}: PageProps) {
  return (
    <Suspense
      fallback={
        <div className="p-10 text-center text-slate-600">
          Loading academic management...
        </div>
      }
    >
      <AcademicYearsContent params={params} />
    </Suspense>
  );
}

async function AcademicYearsContent({
  params,
}: PageProps) {
  const { slug } = await params;

  const {
    school,
    user,
    roles,
  } = await requireSchoolAccess(slug);

  const readableRoles = [
    "proprietor",
    "school_admin",
    "head_teacher",
    "teacher",
    "bursar",
    "librarian",
    "parent",
    "student",
  ];

  const managementRoles = [
    "proprietor",
    "school_admin",
    "head_teacher",
  ];

  const canRead = roles.some((role) =>
    readableRoles.includes(role.code)
  );

  if (!canRead) {
    notFound();
  }

  const canManage = roles.some((role) =>
    managementRoles.includes(role.code)
  );

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

        <section>
          <p className="text-sm font-semibold uppercase tracking-wider text-blue-700">
            Academic Management
          </p>

          <h1 className="mt-3 text-3xl font-bold text-slate-900">
            Academic Years & Terms
          </h1>

          <p className="mt-3 text-slate-600">
            Manage academic calendars for {school.name}.
          </p>
        </section>

        <AcademicCalendarManager
          schoolId={school.id}
          canManage={canManage}
        />

      </div>
    </DashboardLayout>
  );
}