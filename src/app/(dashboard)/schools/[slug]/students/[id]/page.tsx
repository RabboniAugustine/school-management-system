import {Suspense} from "react";
import {notFound} from "next/navigation";
import SchoolModuleFrame from "@/components/dashboard/SchoolModuleFrame";
import StudentProfileManager from "@/features/students/StudentProfileManager";
import {getSchoolModuleContext} from "@/lib/permissions/getSchoolModuleContext";
type Props={params:Promise<{slug:string;id:string}>};
export default function Page({params}:Props){return <Suspense fallback={<main className="p-8">Loading student...</main>}><Content params={params}/></Suspense>;}
async function Content({params}:Props){
 const {slug,id}=await params;
 if(!/^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i.test(id))notFound();
 const ctx=await getSchoolModuleContext(slug,"students.read");
 const {data:student,error}=await ctx.supabase.from("students").select("id,first_name,last_name").eq("school_id",ctx.school.id).eq("id",id).maybeSingle();
 if(error)throw new Error("Unable to verify student profile.");
 if(!student)notFound();
 return <SchoolModuleFrame school={ctx.school} userEmail={ctx.user.email??"Authenticated User"}
  roles={ctx.roles.map(r=>r.name)} permissions={ctx.permissions}
  title={`${student.first_name} ${student.last_name}`} subtitle="Student profile and guardian contacts.">
  <StudentProfileManager schoolId={ctx.school.id} studentId={student.id} canManage={ctx.permissions.has("students.manage")}/>
 </SchoolModuleFrame>;
}
