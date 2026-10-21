import { Suspense } from "react";

import SchoolModuleFrame from "@/components/dashboard/SchoolModuleFrame";
import { getSchoolModuleContext } from "@/lib/permissions/getSchoolModuleContext";
import StudentDirectory from "@/features/students/StudentDirectory";

type Props = {
  params: Promise<{ slug: string }>;
};

export default function Page({ params }: Props) {
  return (
    <Suspense fallback={<main className="p-8">Loading student directory...</main>}>
      <Content params={params} />
    </Suspense>
  );
}

async function Content({ params }: Props) {
  const { slug } = await params;

  const context = await getSchoolModuleContext(
    slug,
    "students.read"
  );

  return (
    <SchoolModuleFrame
      school={context.school}
      userEmail={context.user.email ?? "Authenticated User"}
      roles={context.roles.map((role) => role.name)}
      permissions={context.permissions}
      title="Student Directory"
      subtitle="Find and review student records."
    >
      <StudentDirectory
        schoolId={context.school.id}
        slug={context.school.slug}
        canManage={context.permissions.has("students.manage")}
      />
    </SchoolModuleFrame>
  );
}