import {Suspense} from "react";
import {notFound} from "next/navigation";
import {requireSchoolAccess} from "@/lib/permissions/requireSchoolAccess";
import {getSchoolPermissions} from "@/lib/permissions/getSchoolPermissions";
import SchoolModuleFrame from "@/components/dashboard/SchoolModuleFrame";
import SchoolStats from "@/components/dashboard/SchoolStats";
type Props={params:Promise<{slug:string}>};
export default function Page({params}:Props){return <Suspense fallback={<main className="p-8">Loading administration...</main>}><Content params={params}/></Suspense>;}
async function Content({params}:Props){
 const {slug}=await params;const ctx=await requireSchoolAccess(slug);
 if(!ctx.roles.some(r=>["proprietor","school_admin"].includes(r.code)))notFound();
 const permissions=await getSchoolPermissions(ctx.supabase,ctx.roles.map(r=>r.id));
 return <SchoolModuleFrame school={ctx.school} userEmail={ctx.user.email??"Authenticated User"}
  roles={ctx.roles.map(r=>r.name)} permissions={permissions} title="School Administration"
  subtitle={`Manage operations for ${ctx.school.name}.`}>
  <Suspense fallback={<div className="rounded-xl bg-white p-6">Loading statistics...</div>}>
   <SchoolStats schoolId={ctx.school.id}/>
  </Suspense>
 </SchoolModuleFrame>;
}
