"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { useRun } from "@/lib/useRun";
import { dbMessage } from "@/lib/format";
import { btn, btnLight, card, field, label } from "@/components/ui/styles";
import Notice from "@/components/ui/Notice";
import Empty from "@/components/ui/Empty";

type Year = { id: string; name: string; status: string };
type Cls = { id: string; name: string };
type Period = { id: string; name: string; starts_at: string; ends_at: string; sort_order: number; is_break: boolean };
type Subject = { id: string; name: string };
type Staff = { id: string; first_name: string; last_name: string };
type Slot = { id: string; class_id: string; subject_id: string; staff_id: string | null; period_id: string; day_of_week: number; room: string | null };
type Cell = { day: number; period: Period; slot?: Slot };

const DAYS = [[1, "Monday"], [2, "Tuesday"], [3, "Wednesday"], [4, "Thursday"], [5, "Friday"]] as const;
const hhmm = (t: string) => t.slice(0, 5);

function clashMessage(error: { message?: string; code?: string }): string {
  const m = error.message ?? "";
  if (m.includes("timetable_teacher_clash")) return "That teacher is already teaching another class in this period.";
  if (m.includes("timetable_room_clash")) return "That room is already used by another class in this period.";
  if (error.code === "23505") return "This class already has a lesson in that period.";
  if (error.code === "23503") return "That subject is not assigned to this class. Add it under Academics first.";
  return dbMessage(error);
}

export default function TimetableManager({ schoolId, canManage }: { schoolId: string; canManage: boolean }) {
  const db = useMemo(() => createClient(), []);
  const [years, setYears] = useState<Year[]>([]);
  const [classes, setClasses] = useState<Cls[]>([]);
  const [periods, setPeriods] = useState<Period[]>([]);
  const [staff, setStaff] = useState<Staff[]>([]);
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [slots, setSlots] = useState<Slot[]>([]);
  const [yearId, setYearId] = useState("");
  const [mode, setMode] = useState<"class" | "teacher">("class");
  const [classId, setClassId] = useState("");
  const [staffId, setStaffId] = useState("");
  const [error, setError] = useState("");
  const [ok, setOk] = useState("");
  const [busy, setBusy] = useState(false);
  const [sel, setSel] = useState<Cell | null>(null);
  const [form, setForm] = useState({ subject_id: "", staff_id: "", room: "" });
  const [pf, setPf] = useState({ name: "", starts: "08:00", ends: "08:40", order: "", brk: false });

  const load = useCallback(async () => {
    const [y, c, p, s] = await Promise.all([
      db.from("academic_years").select("id,name,status").eq("school_id", schoolId).order("starts_on", { ascending: false }),
      db.from("school_classes").select("id,name").eq("school_id", schoolId).eq("is_active", true).order("level_order"),
      db.from("timetable_periods").select("*").eq("school_id", schoolId).order("sort_order"),
      db.from("staff_members").select("id,first_name,last_name").eq("school_id", schoolId).order("last_name"),
    ]);
    if (y.error || c.error || p.error) return setError("Unable to load the timetable.");
    const yr = (y.data ?? []) as Year[];
    setYears(yr); setClasses((c.data ?? []) as Cls[]); setPeriods((p.data ?? []) as Period[]); setStaff((s.data ?? []) as Staff[]);
    setYearId((cur) => cur || (yr.find((r) => r.status === "active")?.id ?? yr[0]?.id ?? ""));
    setClassId((cur) => cur || ((c.data ?? [])[0] as Cls | undefined)?.id || "");
  }, [db, schoolId]);
  useRun(load);

  const loadSlots = useCallback(async () => {
    if (!yearId) return;
    const { data, error: e } = await db.from("timetable_slots").select("id,class_id,subject_id,staff_id,period_id,day_of_week,room").eq("school_id", schoolId).eq("academic_year_id", yearId);
    if (e) return setError("Unable to load lessons.");
    setSlots((data ?? []) as Slot[]);
  }, [db, schoolId, yearId]);
  useRun(loadSlots);

  useEffect(() => {
    if (!classId) return;
    void db.from("class_subjects").select("subject_id, school_subjects(id,name)").eq("school_id", schoolId).eq("class_id", classId).then(({ data }) => {
      const subs = ((data ?? []) as unknown as { school_subjects: Subject | Subject[] | null }[])
        .map((r) => (Array.isArray(r.school_subjects) ? r.school_subjects[0] : r.school_subjects)).filter((s): s is Subject => !!s);
      setSubjects(subs.sort((a, b) => a.name.localeCompare(b.name)));
    });
  }, [db, schoolId, classId]);

  const [allSubjects, setAllSubjects] = useState<Subject[]>([]);
  useEffect(() => { void db.from("school_subjects").select("id,name").eq("school_id", schoolId).then(({ data }) => setAllSubjects((data ?? []) as Subject[])); }, [db, schoolId]);

  const subjName = (id: string) => allSubjects.find((s) => s.id === id)?.name ?? "Subject";
  const staffName = (id: string | null) => { const s = staff.find((x) => x.id === id); return s ? `${s.first_name} ${s.last_name}` : ""; };
  const className = (id: string) => classes.find((c) => c.id === id)?.name ?? "";

  const visible = slots.filter((s) => (mode === "class" ? s.class_id === classId : s.staff_id === staffId));
  const slotAt = (day: number, periodId: string) => visible.find((s) => s.day_of_week === day && s.period_id === periodId);

  function pick(day: number, period: Period) {
    if (mode !== "class" || period.is_break) return;
    const slot = slotAt(day, period.id);
    setSel({ day, period, slot });
    setForm({ subject_id: slot?.subject_id ?? subjects[0]?.id ?? "", staff_id: slot?.staff_id ?? "", room: slot?.room ?? "" });
    setError(""); setOk("");
  }

  async function save() {
    if (!sel || !form.subject_id) return setError("Choose a subject.");
    setBusy(true); setError(""); setOk("");
    const payload = { subject_id: form.subject_id, staff_id: form.staff_id || null, room: form.room.trim() || null };
    const res = sel.slot
      ? await db.from("timetable_slots").update(payload).eq("school_id", schoolId).eq("id", sel.slot.id)
      : await db.from("timetable_slots").insert({ school_id: schoolId, academic_year_id: yearId, class_id: classId, period_id: sel.period.id, day_of_week: sel.day, ...payload });
    setBusy(false);
    if (res.error) return setError(clashMessage(res.error));
    setOk("Lesson saved."); setSel(null); await loadSlots();
  }

  async function remove() {
    if (!sel?.slot) return;
    setBusy(true);
    const res = await db.from("timetable_slots").delete().eq("school_id", schoolId).eq("id", sel.slot.id);
    setBusy(false);
    if (res.error) return setError(dbMessage(res.error));
    setOk("Lesson removed."); setSel(null); await loadSlots();
  }

  async function addPeriod(e: React.FormEvent) {
    e.preventDefault();
    const order = Number(pf.order || periods.length + 1);
    setBusy(true); setError(""); setOk("");
    const res = await db.from("timetable_periods").insert({ school_id: schoolId, name: pf.name.trim(), starts_at: pf.starts, ends_at: pf.ends, sort_order: order, is_break: pf.brk });
    setBusy(false);
    if (res.error) return setError(res.error.code === "23505" ? "A period with that order number already exists." : res.error.code === "23514" ? "End time must be after the start time." : dbMessage(res.error));
    setOk("Period added."); setPf({ name: "", starts: pf.ends, ends: "", order: "", brk: false }); await load();
  }

  return (
    <div className="space-y-6">
      <Notice error={error} ok={ok} />
      <div className={`${card} grid gap-3 md:grid-cols-4 md:items-end`}>
        <div><label className={label}>Academic year</label><select className={field} value={yearId} onChange={(e) => { setYearId(e.target.value); setSel(null); }}>{years.map((y) => <option key={y.id} value={y.id}>{y.name}</option>)}</select></div>
        <div><label className={label}>View by</label><select className={field} value={mode} onChange={(e) => { setMode(e.target.value as "class" | "teacher"); setSel(null); }}><option value="class">Class</option><option value="teacher">Teacher</option></select></div>
        {mode === "class"
          ? <div><label className={label}>Class</label><select className={field} value={classId} onChange={(e) => { setClassId(e.target.value); setSel(null); }}>{classes.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></div>
          : <div><label className={label}>Teacher</label><select className={field} value={staffId} onChange={(e) => setStaffId(e.target.value)}><option value="">Choose…</option>{staff.map((s) => <option key={s.id} value={s.id}>{s.first_name} {s.last_name}</option>)}</select></div>}
      </div>

      {periods.length === 0 ? <Empty>No periods defined yet.{canManage ? " Add your school day below." : ""}</Empty> : (
        <div className={`${card} overflow-x-auto p-0`}>
          <table className="w-full min-w-[640px] border-collapse">
            <thead><tr className="border-b"><th className="w-32 px-3 py-2 text-left text-xs font-semibold uppercase text-slate-500">Period</th>{DAYS.map(([d, n]) => <th key={d} className="px-3 py-2 text-left text-xs font-semibold uppercase text-slate-500">{n}</th>)}</tr></thead>
            <tbody>{periods.map((p) => (
              <tr key={p.id} className="border-b last:border-0">
                <td className="px-3 py-2 text-sm"><b>{p.name}</b><div className="text-xs text-slate-500">{hhmm(p.starts_at)}–{hhmm(p.ends_at)}</div></td>
                {p.is_break ? <td colSpan={5} className="bg-slate-50 px-3 py-2 text-center text-sm text-slate-500">Break</td> : DAYS.map(([d]) => {
                  const s = slotAt(d, p.id);
                  const active = sel?.day === d && sel.period.id === p.id;
                  return (
                    <td key={d} className="p-1.5 align-top">
                      <button disabled={mode !== "class" || !canManage} onClick={() => pick(d, p)}
                        className={`min-h-14 w-full rounded-lg border px-2 py-1.5 text-left text-sm ${active ? "border-blue-700 bg-blue-50" : s ? "border-slate-200 bg-white" : "border-dashed border-slate-300 text-slate-400"} ${mode === "class" && canManage ? "hover:bg-slate-50" : ""}`}>
                        {s ? <><span className="font-semibold">{subjName(s.subject_id)}</span>
                          <span className="block text-xs text-slate-600">{mode === "teacher" ? className(s.class_id) : staffName(s.staff_id)}{s.room ? ` · ${s.room}` : ""}</span></> : (mode === "class" && canManage ? "+ add" : "")}
                      </button>
                    </td>);
                })}
              </tr>))}</tbody>
          </table>
        </div>)}

      {sel && canManage && (
        <div className={`${card} space-y-3`}>
          <h3 className="font-semibold">{DAYS.find(([d]) => d === sel.day)?.[1]} · {sel.period.name} · {className(classId)}</h3>
          {subjects.length === 0 ? <Notice error="This class has no subjects. Assign subjects to the class under Academics first." /> : (
            <div className="grid gap-3 md:grid-cols-3">
              <div><label className={label}>Subject</label><select className={field} value={form.subject_id} onChange={(e) => setForm({ ...form, subject_id: e.target.value })}>{subjects.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select></div>
              <div><label className={label}>Teacher</label><select className={field} value={form.staff_id} onChange={(e) => setForm({ ...form, staff_id: e.target.value })}><option value="">Unassigned</option>{staff.map((s) => <option key={s.id} value={s.id}>{s.first_name} {s.last_name}</option>)}</select></div>
              <div><label className={label}>Room</label><input className={field} maxLength={40} value={form.room} onChange={(e) => setForm({ ...form, room: e.target.value })} /></div>
            </div>)}
          <div className="flex gap-2"><button className={btn} disabled={busy || subjects.length === 0} onClick={save}>Save lesson</button>
            {sel.slot && <button className={btnLight} disabled={busy} onClick={remove}>Remove</button>}<button className={btnLight} onClick={() => setSel(null)}>Cancel</button></div>
        </div>)}

      {canManage && (
        <form onSubmit={addPeriod} className={`${card} grid gap-3 md:grid-cols-6 md:items-end`}>
          <div className="md:col-span-2"><label className={label}>New period</label><input className={field} required maxLength={60} placeholder="Period 1" value={pf.name} onChange={(e) => setPf({ ...pf, name: e.target.value })} /></div>
          <div><label className={label}>Starts</label><input type="time" className={field} required value={pf.starts} onChange={(e) => setPf({ ...pf, starts: e.target.value })} /></div>
          <div><label className={label}>Ends</label><input type="time" className={field} required value={pf.ends} onChange={(e) => setPf({ ...pf, ends: e.target.value })} /></div>
          <div><label className={label}>Order</label><input className={field} inputMode="numeric" placeholder={String(periods.length + 1)} value={pf.order} onChange={(e) => setPf({ ...pf, order: e.target.value })} /></div>
          <label className="flex items-center gap-2 pb-2 text-sm"><input type="checkbox" checked={pf.brk} onChange={(e) => setPf({ ...pf, brk: e.target.checked })} /> Break</label>
          <div className="md:col-span-6"><button className={btn} disabled={busy}>Add period</button></div>
        </form>)}
    </div>
  );
}
