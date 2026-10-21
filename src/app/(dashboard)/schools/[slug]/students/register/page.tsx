import {Suspense} from "react";
import SchoolModuleFrame from "@/components/dashboard/SchoolModuleFrame";
import StudentRegistrationForm from "@/features/students/StudentRegistrationForm";
import {getSchoolModuleContext} from "@/lib/permissions/getSchoolModuleContext";
type Props={params:Promise<{slug:string}>};
export default function Page({params}:Props){return <Suspense fallback={<main className="p-8">Loading registration...</main>}><Content params={params}/></Suspense>;}
async function Content({params}:Props){
 const {slug}=await params;const ctx=await getSchoolModuleContext(slug,"students.manage");
 return <SchoolModuleFrame school={ctx.school} userEmail={ctx.user.email??"Authenticated User"}
  roles={ctx.roles.map(r=>r.name)} permissions={ctx.permissions}
  title="Register Student" subtitle="Create a new student record for this school.">
  <StudentRegistrationForm schoolId={ctx.school.id} slug={ctx.school.slug}/>
 </SchoolModuleFrame>;
}
