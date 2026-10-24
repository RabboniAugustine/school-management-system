import type { ReactNode } from "react";
import DashboardLayout from "@/components/layout/DashboardLayout";
import ModuleLinks from "@/components/dashboard/ModuleLinks";
import OfflineStatus from "@/components/offline/OfflineStatus";

export default function SchoolModuleFrame({
  school, userEmail, roles, permissions, title, subtitle, children,
}: {
  school: { name: string; slug: string };
  userEmail: string;
  roles: string[];
  permissions: Set<string>;
  title: string;
  subtitle: string;
  children: ReactNode;
}) {
  return (
    <DashboardLayout school={school} user={{ email: userEmail }} roles={roles}>
      <div className="space-y-7">
        <OfflineStatus owner={userEmail} />
        <ModuleLinks slug={school.slug} permissions={permissions} />
        <header>
          <h1 className="text-3xl font-bold text-slate-900">{title}</h1>
          <p className="mt-2 text-slate-600">{subtitle}</p>
        </header>
        {children}
      </div>
    </DashboardLayout>
  );
}
