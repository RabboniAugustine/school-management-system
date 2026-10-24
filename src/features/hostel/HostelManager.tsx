"use client";

import { useCallback, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { useRun } from "@/lib/useRun";
import { dbMessage, fmtDate, today } from "@/lib/format";
import { btn, btnLight, card, field, label } from "@/components/ui/styles";
import Notice from "@/components/ui/Notice";
import Empty from "@/components/ui/Empty";

type Hostel = { id: string; name: string; gender: string; is_active: boolean };
type Room = { id: string; hostel_id: string; room_number: string; capacity: number };
type Alloc = { id: string; room_id: string; student_id: string; academic_year_id: string; allocated_on: string };
type Student = { id: string; first_name: string; last_name: string; admission_number: string };
type Year = { id: string; name: string; status: string };

export default function HostelManager({ schoolId, canManage }: { schoolId: string; canManage: boolean }) {
  const db = useMemo(() => createClient(), []);
  const [hostels, setHostels] = useState<Hostel[]>([]);
  const [rooms, setRooms] = useState<Room[]>([]);
  const [allocs, setAllocs] = useState<Alloc[]>([]);
  const [students, setStudents] = useState<Student[]>([]);
  const [years, setYears] = useState<Year[]>([]);
  const [error, setError] = useState("");
  const [ok, setOk] = useState("");
  const [busy, setBusy] = useState(false);
  const [hf, setHf] = useState({ name: "", gender: "mixed" });
  const [rf, setRf] = useState({ hostel_id: "", number: "", capacity: "" });
  const [af, setAf] = useState({ student_id: "", room_id: "", year_id: "" });
  const [find, setFind] = useState("");

  const load = useCallback(async () => {
    const [h, r, a, s, y] = await Promise.all([
      db.from("hostels").select("*").eq("school_id", schoolId).order("name"),
      db.from("hostel_rooms").select("id,hostel_id,room_number,capacity").eq("school_id", schoolId).order("room_number"),
      db.from("hostel_allocations").select("id,room_id,student_id,academic_year_id,allocated_on").eq("school_id", schoolId).eq("status", "active"),
      db.from("students").select("id,first_name,last_name,admission_number").eq("school_id", schoolId).eq("status", "active").order("last_name").limit(2000),
      db.from("academic_years").select("id,name,status").eq("school_id", schoolId).order("starts_on", { ascending: false }),
    ]);
    if (h.error || r.error || a.error) return setError("Unable to load hostel data.");
    const yr = (y.data ?? []) as Year[];
    setHostels((h.data ?? []) as Hostel[]); setRooms((r.data ?? []) as Room[]); setAllocs((a.data ?? []) as Alloc[]); setStudents((s.data ?? []) as Student[]); setYears(yr);
    setAf((f) => ({ ...f, year_id: f.year_id || (yr.find((x) => x.status === "active")?.id ?? yr[0]?.id ?? "") }));
  }, [db, schoolId]);
  useRun(load);

  async function act(fn: () => PromiseLike<{ error: { message?: string; code?: string } | null }>, success: string) {
    setError(""); setOk(""); setBusy(true);
    const res = await fn();
    setBusy(false);
    if (res.error) { setError(res.error.code === "23514" ? (res.error.message ?? "Not allowed.") : dbMessage(res.error)); return false; }
    setOk(success); await load(); return true;
  }

  const used = (roomId: string) => allocs.filter((a) => a.room_id === roomId).length;
  const who = (id: string) => { const s = students.find((x) => x.id === id); return s ? `${s.last_name}, ${s.first_name} (${s.admission_number})` : "Unknown"; };
  const needle = find.trim().toLowerCase();
  const studentOptions = students.filter((s) => !needle || `${s.first_name} ${s.last_name} ${s.admission_number}`.toLowerCase().includes(needle)).slice(0, 200);
  const activeHostel = (id: string) => hostels.find((h) => h.id === id)?.is_active;
  const freeRooms = rooms.filter((r) => activeHostel(r.hostel_id) && used(r.id) < r.capacity);
  const totalBeds = rooms.filter((r) => activeHostel(r.hostel_id)).reduce((s, r) => s + r.capacity, 0);

  async function addHostel(e: React.FormEvent) {
    e.preventDefault();
    if (await act(() => db.from("hostels").insert({ school_id: schoolId, name: hf.name.trim(), gender: hf.gender }), "Hostel added.")) setHf({ name: "", gender: "mixed" });
  }
  async function addRoom(e: React.FormEvent) {
    e.preventDefault();
    const cap = Number(rf.capacity);
    if (!Number.isInteger(cap) || cap < 1) return setError("Beds must be a whole number.");
    if (await act(() => db.from("hostel_rooms").insert({ school_id: schoolId, hostel_id: rf.hostel_id, room_number: rf.number.trim(), capacity: cap }), "Room added.")) setRf({ ...rf, number: "", capacity: "" });
  }
  async function allocate(e: React.FormEvent) {
    e.preventDefault();
    if (await act(() => db.from("hostel_allocations").insert({ school_id: schoolId, room_id: af.room_id, student_id: af.student_id, academic_year_id: af.year_id, allocated_on: today() }), "Bed allocated.")) setAf({ ...af, student_id: "" });
  }

  return (
    <div className="space-y-6">
      <Notice error={error} ok={ok} />
      <div className="grid gap-3 sm:grid-cols-3">
        <div className={card}><p className="text-sm text-slate-500">Beds</p><p className="mt-1 text-xl font-bold">{totalBeds}</p></div>
        <div className={card}><p className="text-sm text-slate-500">Occupied</p><p className="mt-1 text-xl font-bold">{allocs.length}</p></div>
        <div className={card}><p className="text-sm text-slate-500">Free</p><p className="mt-1 text-xl font-bold text-green-700">{Math.max(0, totalBeds - allocs.length)}</p></div>
      </div>

      {canManage && <>
        <form onSubmit={addHostel} className={`${card} grid gap-3 md:grid-cols-4 md:items-end`}>
          <div className="md:col-span-2"><label className={label}>Hostel name</label><input className={field} required minLength={2} maxLength={120} value={hf.name} onChange={(e) => setHf({ ...hf, name: e.target.value })} /></div>
          <div><label className={label}>For</label><select className={field} value={hf.gender} onChange={(e) => setHf({ ...hf, gender: e.target.value })}><option value="mixed">Boys and girls</option><option value="male">Boys only</option><option value="female">Girls only</option></select></div>
          <button className={btn} disabled={busy}>Add hostel</button></form>
        <form onSubmit={addRoom} className={`${card} grid gap-3 md:grid-cols-4 md:items-end`}>
          <div><label className={label}>Hostel</label><select className={field} required value={rf.hostel_id} onChange={(e) => setRf({ ...rf, hostel_id: e.target.value })}><option value="">Choose…</option>{hostels.filter((h) => h.is_active).map((h) => <option key={h.id} value={h.id}>{h.name}</option>)}</select></div>
          <div><label className={label}>Room number</label><input className={field} required maxLength={20} value={rf.number} onChange={(e) => setRf({ ...rf, number: e.target.value })} /></div>
          <div><label className={label}>Beds</label><input className={field} required inputMode="numeric" value={rf.capacity} onChange={(e) => setRf({ ...rf, capacity: e.target.value })} /></div>
          <button className={btn} disabled={busy}>Add room</button></form>
        <form onSubmit={allocate} className={`${card} grid gap-3 md:grid-cols-5 md:items-end`}>
          <div><label className={label}>Find student</label><input className={field} placeholder="Name or admission no." value={find} onChange={(e) => setFind(e.target.value)} /></div>
          <div><label className={label}>Student</label><select className={field} required value={af.student_id} onChange={(e) => setAf({ ...af, student_id: e.target.value })}><option value="">Choose…</option>{studentOptions.map((s) => <option key={s.id} value={s.id}>{s.last_name}, {s.first_name} ({s.admission_number})</option>)}</select></div>
          <div><label className={label}>Room (free beds)</label><select className={field} required value={af.room_id} onChange={(e) => setAf({ ...af, room_id: e.target.value })}><option value="">Choose…</option>{freeRooms.map((r) => <option key={r.id} value={r.id}>{hostels.find((h) => h.id === r.hostel_id)?.name} · {r.room_number} ({r.capacity - used(r.id)} free)</option>)}</select></div>
          <div><label className={label}>Year</label><select className={field} value={af.year_id} onChange={(e) => setAf({ ...af, year_id: e.target.value })}>{years.map((y) => <option key={y.id} value={y.id}>{y.name}</option>)}</select></div>
          <button className={btn} disabled={busy}>Allocate bed</button></form></>}

      {hostels.length === 0 ? <Empty>No hostels yet.</Empty> : hostels.map((h) => (
        <div key={h.id} className={`${card} p-0`}>
          <div className="flex items-center justify-between border-b px-4 py-3"><h3 className="font-semibold">{h.name} <span className="ml-2 text-xs font-normal text-slate-500">{h.gender === "mixed" ? "Boys and girls" : h.gender === "male" ? "Boys only" : "Girls only"}{!h.is_active && " · inactive"}</span></h3>
            {canManage && <button className={btnLight} disabled={busy} onClick={() => act(() => db.from("hostels").update({ is_active: !h.is_active }).eq("school_id", schoolId).eq("id", h.id), "Updated.")}>{h.is_active ? "Deactivate" : "Activate"}</button>}</div>
          {rooms.filter((r) => r.hostel_id === h.id).length === 0 ? <p className="px-4 py-3 text-sm text-slate-500">No rooms yet.</p> : rooms.filter((r) => r.hostel_id === h.id).map((r) => (
            <div key={r.id} className="border-b px-4 py-3 last:border-0"><p className="text-sm font-medium">Room {r.room_number} <span className="font-normal text-slate-500">· {used(r.id)}/{r.capacity} beds</span></p>
              <ul className="mt-1 space-y-1">{allocs.filter((a) => a.room_id === r.id).map((a) => <li key={a.id} className="flex items-center justify-between text-sm"><span>{who(a.student_id)} <span className="text-xs text-slate-500">since {fmtDate(a.allocated_on)}</span></span>
                {canManage && <button className={btnLight} disabled={busy} onClick={() => act(() => db.from("hostel_allocations").update({ status: "ended", ended_on: today() }).eq("school_id", schoolId).eq("id", a.id), "Bed released.")}>Release</button>}</li>)}</ul></div>))}
        </div>))}
    </div>
  );
}
