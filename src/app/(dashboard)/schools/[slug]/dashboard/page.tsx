import {Suspense} from "react";
import {requireSchoolAccess} from "@/lib/permissions/requireSchoolAccess";
import {getSchoolPermissions} from "@/lib/permissions/getSchoolPermissions";
import SchoolModuleFrame from "@/components/dashboard/SchoolModuleFrame";
import ModuleLinks from "@/components/dashboard/ModuleLinks";
type Props={params:Promise<{slug:string}>};
export default function Page({params}:Props){return <Suspense fallback={<main className="p-8">Loading dashboard...</main>}><Content params={params}/></Suspense>;}
async function Content({params}:Props){
 const {slug}=await params;const ctx=await requireSchoolAccess(slug);
 const permissions=await getSchoolPermissions(ctx.supabase,ctx.roles.map(r=>r.id));
 const isAdmin=ctx.roles.some(r=>["proprietor","school_admin"].includes(r.code));
 return <SchoolModuleFrame school={ctx.school} userEmail={ctx.user.email??"Authenticated User"}
  roles={ctx.roles.map(r=>r.name)} permissions={permissions} title={`Welcome to ${ctx.school.name}`}
  subtitle="Everything your role can do is listed below and in the menu.">
  <div className="grid gap-5 md:grid-cols-3">
   <div className="rounded-2xl border bg-white p-6"><p className="text-sm text-slate-500">School Status</p><p className="mt-3 text-2xl font-bold text-green-700">Active</p></div>
   <div className="rounded-2xl border bg-white p-6"><p className="text-sm text-slate-500">Assigned Roles</p><p className="mt-3 text-2xl font-bold">{ctx.roles.length}</p></div>
   <div className="rounded-2xl border bg-white p-6"><p className="text-sm text-slate-500">School URL</p><p className="mt-3 break-all font-semibold">{ctx.school.slug}</p></div>
  </div>
  <ModuleLinks slug={ctx.school.slug} permissions={permissions} isAdmin={isAdmin}/>
 </SchoolModuleFrame>;
}
