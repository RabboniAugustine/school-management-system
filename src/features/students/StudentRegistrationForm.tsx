"use client";
import {useEffect,useMemo,useState,type FormEvent} from "react";
import Link from "next/link";
import {createClient} from "@/lib/supabase/client";
const input="w-full rounded-lg border border-slate-300 px-4 py-3";
export default function StudentRegistrationForm({schoolId,slug}:{schoolId:string;slug:string}){
 const db=useMemo(()=>createClient(),[]);
 const [branches,setBranches]=useState<{id:string;name:string}[]>([]);
 const [branch,setBranch]=useState("");const [number,setNumber]=useState("");const [first,setFirst]=useState("");const [last,setLast]=useState("");const [middle,setMiddle]=useState("");const [dob,setDob]=useState("");const [gender,setGender]=useState("");
 const [error,setError]=useState("");const [saving,setSaving]=useState(false);const [created,setCreated]=useState("");
 useEffect(()=>{let active=true;void (async()=>{
  const {data,error:err}=await db.from("branches").select("id,name").eq("school_id",schoolId).eq("is_active",true).order("name");
  if(!active)return;if(err){setError("Unable to load branches.");return;}setBranches(data??[]);setBranch(data?.[0]?.id??"");
 })();return()=>{active=false;};},[db,schoolId]);
 async function save(e:FormEvent){e.preventDefault();if(saving||!branch)return;setSaving(true);setError("");
  const {data,error:err}=await db.from("students").insert({school_id:schoolId,branch_id:branch,admission_number:number.trim(),first_name:first.trim(),last_name:last.trim(),middle_name:middle.trim()||null,date_of_birth:dob||null,gender:gender||null}).select("id").single();
  setSaving(false);if(err){setError(err.message);return;}setCreated(data.id);
 }
 if(created)return <section className="rounded-2xl border border-green-200 bg-green-50 p-8">
  <h2 className="text-2xl font-bold text-green-900">Student Registered</h2>
  <p className="mt-3">{first} {last} · Admission number {number}</p>
  <Link href={`/schools/${encodeURIComponent(slug)}/students/${created}`} className="mt-5 inline-block rounded-lg bg-green-800 px-5 py-3 font-semibold text-white">Open Student Profile</Link>
 </section>;
 return <form onSubmit={e=>void save(e)} className="mx-auto max-w-3xl space-y-5 rounded-2xl border bg-white p-6">
  {error&&<p role="alert" className="rounded-lg bg-red-50 p-3 text-red-700">{error}</p>}
  <label className="block text-sm font-semibold">Branch<select required className={input} value={branch} onChange={e=>setBranch(e.target.value)}><option value="">Select branch</option>{branches.map(b=><option key={b.id} value={b.id}>{b.name}</option>)}</select></label>
  <label className="block text-sm font-semibold">Admission Number<input required minLength={2} maxLength={40} className={input} value={number} onChange={e=>setNumber(e.target.value)}/></label>
  <div className="grid gap-4 md:grid-cols-2">
   <label className="block text-sm font-semibold">First Name<input required maxLength={100} className={input} value={first} onChange={e=>setFirst(e.target.value)}/></label>
   <label className="block text-sm font-semibold">Last Name<input required maxLength={100} className={input} value={last} onChange={e=>setLast(e.target.value)}/></label>
  </div>
  <label className="block text-sm font-semibold">Middle Name (optional)<input maxLength={100} className={input} value={middle} onChange={e=>setMiddle(e.target.value)}/></label>
  <div className="grid gap-4 md:grid-cols-2">
   <label className="block text-sm font-semibold">Date of Birth (optional)<input type="date" className={input} value={dob} onChange={e=>setDob(e.target.value)}/></label>
   <label className="block text-sm font-semibold">Gender (optional)<select className={input} value={gender} onChange={e=>setGender(e.target.value)}><option value="">Not specified</option><option value="female">Female</option><option value="male">Male</option><option value="other">Other</option><option value="prefer_not_to_say">Prefer not to say</option></select></label>
  </div>
  <button disabled={saving||!branch} className="rounded-xl bg-blue-800 px-6 py-3 font-semibold text-white disabled:opacity-40">{saving?"Registering...":"Register Student"}</button>
 </form>;
}
