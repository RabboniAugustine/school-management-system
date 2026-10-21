import { createClient } from "@/lib/supabase/server";

interface SchoolStatsProps {
  schoolId: string;
}

interface Statistic {
  title: string;
  value: number;
  description: string;
  icon: string;
}

export default async function SchoolStats({
  schoolId,
}: SchoolStatsProps) {
  const supabase = await createClient();

  // Count school branches
  const branchesQuery = supabase
    .from("branches")
    .select("id", {
      count: "exact",
      head: true,
    })
    .eq("school_id", schoolId)
    .eq("is_active", true);

  // Count active school memberships
  const membersQuery = supabase
    .from("school_memberships")
    .select("id", {
      count: "exact",
      head: true,
    })
    .eq("school_id", schoolId)
    .eq("status", "active");

  // Count pending invitations
  const invitationsQuery = supabase
    .from("school_memberships")
    .select("id", {
      count: "exact",
      head: true,
    })
    .eq("school_id", schoolId)
    .eq("status", "invited");

  // Count assigned school roles
  const rolesQuery = supabase
    .from("user_roles")
    .select("id", {
      count: "exact",
      head: true,
    })
    .eq("school_id", schoolId);

  const [
    branches,
    members,
    invitations,
    roles,
  ] = await Promise.all([
    branchesQuery,
    membersQuery,
    invitationsQuery,
    rolesQuery,
  ]);

  // Reject failed database requests
  if (
    branches.error ||
    members.error ||
    invitations.error ||
    roles.error
  ) {
    throw new Error(
      "Unable to retrieve school statistics."
    );
  }

  const statistics: Statistic[] = [
    {
      title: "Active Branches",
      value: branches.count ?? 0,
      description: "Operating school campuses",
      icon: "🏫",
    },

    {
      title: "Active Members",
      value: members.count ?? 0,
      description: "Active user memberships",
      icon: "👥",
    },

    {
      title: "Pending Invitations",
      value: invitations.count ?? 0,
      description: "School membership invitations",
      icon: "✉️",
    },

    {
      title: "Assigned Roles",
      value: roles.count ?? 0,
      description: "Total school role assignments",
      icon: "🔐",
    },
  ];

  return (
    <section>
      <div className="mb-6">
        <h2 className="text-2xl font-bold text-slate-900">
          School Overview
        </h2>

        <p className="mt-2 text-sm text-slate-600">
          Live statistics from your school&apos;s records.
        </p>
      </div>

      <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-4">
        {statistics.map((statistic) => (
          <article
            key={statistic.title}
            className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm"
          >
            <div className="flex items-center justify-between">
              <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-blue-50 text-2xl">
                {statistic.icon}
              </div>
            </div>

            <p className="mt-6 text-sm font-semibold text-slate-500">
              {statistic.title}
            </p>

            <p className="mt-3 text-4xl font-bold tracking-tight text-slate-900">
              {statistic.value.toLocaleString()}
            </p>

            <p className="mt-3 text-xs leading-5 text-slate-500">
              {statistic.description}
            </p>
          </article>
        ))}
      </div>
    </section>
  );
}