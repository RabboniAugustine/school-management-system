import Link from "next/link";
import { buildNavigation } from "@/lib/navigation";

/** Dashboard quick links: the same permission-filtered modules as the sidebar, grouped by area. */
export default function ModuleLinks({ slug, permissions, isAdmin = false }: {
  slug: string;
  permissions: Set<string>;
  isAdmin?: boolean;
}) {
  const base = `/schools/${encodeURIComponent(slug)}`;
  const sections = buildNavigation(permissions, isAdmin)
    .map((s) => ({ ...s, items: s.items.filter((i) => i.path !== "dashboard") }))
    .filter((s) => s.items.length > 0);

  if (sections.length === 0) {
    return <p className="rounded-xl border border-dashed border-slate-300 bg-white px-4 py-6 text-center text-sm text-slate-500">No modules have been assigned to your role yet. Please contact your school administrator.</p>;
  }

  return (
    <div className="space-y-6">
      {sections.map((section) => (
        <section key={section.title}>
          <h2 className="mb-3 text-xs font-semibold uppercase tracking-widest text-slate-500">{section.title.replace("&amp;", "&")}</h2>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {section.items.map((item) => (
              <Link key={item.path} href={`${base}/${item.path}`}
                className="rounded-2xl border border-slate-200 bg-white px-5 py-4 text-sm font-semibold text-slate-800 transition hover:border-blue-300 hover:bg-blue-50">
                {item.label}
              </Link>
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}
