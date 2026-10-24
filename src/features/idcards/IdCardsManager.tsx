"use client";

import { useCallback, useMemo, useState } from "react";
import QRCode from "qrcode";
import { createClient } from "@/lib/supabase/client";
import { useRun } from "@/lib/useRun";
import { esc, printHtml } from "@/lib/format";
import { btn, card, field, label, td, th } from "@/components/ui/styles";
import Tabs from "@/components/ui/Tabs";
import Notice from "@/components/ui/Notice";
import Empty from "@/components/ui/Empty";

type Cls = { id: string; name: string };
type Year = { id: string; name: string; status: string };
type Person = { id: string; first: string; last: string; code: string; line: string };
type Tab = "students" | "staff";

const CARD_CSS = `
.sheet{display:grid;grid-template-columns:repeat(2,85.6mm);gap:6mm;justify-content:center}
.idc{width:85.6mm;height:54mm;border:1px solid #94a3b8;border-radius:3mm;overflow:hidden;display:flex;flex-direction:column;page-break-inside:avoid;break-inside:avoid}
.idc header{background:#1e3a8a;color:#fff;padding:2mm 3mm;font-size:11px;font-weight:700;letter-spacing:.03em;text-transform:uppercase}
.idc header small{display:block;font-weight:400;font-size:8px;opacity:.85;text-transform:none}
.idc .body{flex:1;display:flex;gap:3mm;padding:3mm;align-items:center}
.idc .av{width:20mm;height:24mm;border-radius:2mm;background:#e2e8f0;color:#475569;display:flex;align-items:center;justify-content:center;font-size:20px;font-weight:700}
.idc .info{flex:1;min-width:0}.idc .nm{font-size:13px;font-weight:700;line-height:1.2}.idc .ln{font-size:10px;color:#475569;margin-top:1mm}
.idc .qr{width:17mm;height:17mm}.idc .qr svg{width:100%;height:100%}.idc .code{font-size:9px;font-family:monospace;margin-top:1mm}
@media print{@page{size:A4;margin:10mm}body{margin:0}}`;

export default function IdCardsManager({ schoolId, schoolName, canStaff }: { schoolId: string; schoolName: string; canStaff: boolean }) {
  const db = useMemo(() => createClient(), []);
  const [tab, setTab] = useState<Tab>("students");
  const [classes, setClasses] = useState<Cls[]>([]);
  const [years, setYears] = useState<Year[]>([]);
  const [classId, setClassId] = useState("");
  const [students, setStudents] = useState<Person[]>([]);
  const [staff, setStaff] = useState<Person[]>([]);
  const [yearName, setYearName] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const loadBase = useCallback(async () => {
    const [c, y] = await Promise.all([
      db.from("school_classes").select("id,name").eq("school_id", schoolId).eq("is_active", true).order("level_order"),
      db.from("academic_years").select("id,name,status").eq("school_id", schoolId).order("starts_on", { ascending: false }),
    ]);
    if (c.error || y.error) return setError("Unable to load classes.");
    const yr = (y.data ?? []) as Year[];
    setClasses((c.data ?? []) as Cls[]); setYears(yr); setYearName(yr.find((r) => r.status === "active")?.name ?? yr[0]?.name ?? "");
    setClassId((cur) => cur || ((c.data ?? [])[0] as Cls | undefined)?.id || "");
    if (canStaff) {
      const s = await db.from("staff_members").select("id,first_name,last_name,employee_number,job_title,status").eq("school_id", schoolId).order("last_name");
      setStaff(((s.data ?? []) as { id: string; first_name: string; last_name: string; employee_number: string; job_title: string | null; status: string }[])
        .filter((x) => x.status !== "inactive").map((x) => ({ id: x.id, first: x.first_name, last: x.last_name, code: x.employee_number, line: x.job_title ?? "Staff" })));
    }
  }, [db, schoolId, canStaff]);
  useRun(loadBase);

  const loadStudents = useCallback(async () => {
    if (!classId) return;
    const active = years.find((y) => y.status === "active") ?? years[0];
    if (!active) return;
    const en = await db.from("student_enrollments").select("student_id").eq("school_id", schoolId).eq("class_id", classId).eq("academic_year_id", active.id).eq("status", "active");
    const ids = ((en.data ?? []) as { student_id: string }[]).map((e) => e.student_id);
    if (ids.length === 0) return setStudents([]);
    const st = await db.from("students").select("id,first_name,last_name,admission_number").eq("school_id", schoolId).in("id", ids).order("last_name");
    const cname = classes.find((c) => c.id === classId)?.name ?? "";
    setStudents(((st.data ?? []) as { id: string; first_name: string; last_name: string; admission_number: string }[]).map((s) => ({ id: s.id, first: s.first_name, last: s.last_name, code: s.admission_number, line: cname })));
  }, [db, schoolId, classId, years, classes]);
  useRun(loadStudents);

  const list = tab === "students" ? students : staff;

  async function print() {
    setBusy(true); setError("");
    try {
      const cards = await Promise.all(list.map(async (p) => {
        const svg = await QRCode.toString(p.code, { type: "svg", margin: 0, errorCorrectionLevel: "M" });
        const initials = `${p.first[0] ?? ""}${p.last[0] ?? ""}`.toUpperCase();
        return `<div class="idc"><header>${esc(schoolName)}<small>${tab === "students" ? `Student ID · ${esc(yearName)}` : "Staff ID"}</small></header>
          <div class="body"><div class="av">${esc(initials)}</div><div class="info"><div class="nm">${esc(p.first)} ${esc(p.last)}</div><div class="ln">${esc(p.line)}</div><div class="code">${esc(p.code)}</div></div><div class="qr">${svg}</div></div></div>`;
      }));
      printHtml("ID cards", `<style>${CARD_CSS}</style><div class="sheet">${cards.join("")}</div>`);
    } catch { setError("Could not build the cards."); }
    setBusy(false);
  }

  return (
    <div className="space-y-6">
      <Notice error={error} />
      <Tabs<Tab> value={tab} onChange={setTab} tabs={[{ id: "students", label: "Student cards" }, ...(canStaff ? [{ id: "staff" as Tab, label: "Staff cards" }] : [])]} />
      <div className={`${card} flex flex-wrap items-end gap-3`}>
        {tab === "students" && <div><label className={label}>Class</label><select className={field} value={classId} onChange={(e) => setClassId(e.target.value)}>{classes.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></div>}
        <button className={btn} disabled={busy || list.length === 0} onClick={print}>Print {list.length} card{list.length === 1 ? "" : "s"}</button>
        <p className="text-sm text-slate-500">Cards print 8 per A4 sheet at ID-card size (85.6 × 54 mm). The QR code holds the {tab === "students" ? "admission" : "employee"} number.</p>
      </div>
      {list.length === 0 ? <Empty>No {tab === "students" ? "enrolled students in this class" : "staff records"} to print.</Empty> : (
        <div className={`${card} overflow-x-auto p-0`}><table className="w-full"><thead className="border-b"><tr><th className={th}>Name</th><th className={th}>{tab === "students" ? "Admission no." : "Employee no."}</th><th className={th}>{tab === "students" ? "Class" : "Role"}</th></tr></thead>
          <tbody>{list.map((p) => <tr key={p.id} className="border-b last:border-0"><td className={td}>{p.last}, {p.first}</td><td className={td}>{p.code}</td><td className={td}>{p.line}</td></tr>)}</tbody></table></div>)}
    </div>
  );
}
