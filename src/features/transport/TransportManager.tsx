"use client";

import { useCallback, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { useRun } from "@/lib/useRun";
import { dbMessage, ghs, toPesewas } from "@/lib/format";
import { btn, btnLight, card, field, label, td, th } from "@/components/ui/styles";
import Tabs from "@/components/ui/Tabs";
import Notice from "@/components/ui/Notice";
import Empty from "@/components/ui/Empty";

type Route = { id: string; name: string; description: string | null; fee_pesewas: number; is_active: boolean };
type Vehicle = { id: string; route_id: string | null; plate_number: string; capacity: number; driver_name: string | null; driver_phone: string | null; is_active: boolean };
type Assign = { id: string; student_id: string; route_id: string; academic_year_id: string; pickup_point: string | null; status: string };
type Student = { id: string; first_name: string; last_name: string; admission_number: string };
type Year = { id: string; name: string; status: string };
type Tab = "routes" | "students";

export default function TransportManager({ schoolId, canManage }: { schoolId: string; canManage: boolean }) {
  const db = useMemo(() => createClient(), []);
  const [tab, setTab] = useState<Tab>("routes");
  const [routes, setRoutes] = useState<Route[]>([]);
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [assigns, setAssigns] = useState<Assign[]>([]);
  const [students, setStudents] = useState<Student[]>([]);
  const [years, setYears] = useState<Year[]>([]);
  const [error, setError] = useState("");
  const [ok, setOk] = useState("");
  const [busy, setBusy] = useState(false);
  const [rf, setRf] = useState({ name: "", fee: "", description: "" });
  const [vf, setVf] = useState({ plate: "", capacity: "", route_id: "", driver: "", phone: "" });
  const [af, setAf] = useState({ student_id: "", route_id: "", pickup: "", year_id: "" });
  const [find, setFind] = useState("");

  const load = useCallback(async () => {
    const [r, v, a, s, y] = await Promise.all([
      db.from("transport_routes").select("*").eq("school_id", schoolId).order("name"),
      db.from("transport_vehicles").select("*").eq("school_id", schoolId).order("plate_number"),
      db.from("student_transport").select("id,student_id,route_id,academic_year_id,pickup_point,status").eq("school_id", schoolId).eq("status", "active"),
      db.from("students").select("id,first_name,last_name,admission_number").eq("school_id", schoolId).eq("status", "active").order("last_name").limit(2000),
      db.from("academic_years").select("id,name,status").eq("school_id", schoolId).order("starts_on", { ascending: false }),
    ]);
    if (r.error || v.error || a.error) return setError("Unable to load transport data.");
    const yr = (y.data ?? []) as Year[];
    setRoutes((r.data ?? []) as Route[]); setVehicles((v.data ?? []) as Vehicle[]); setAssigns((a.data ?? []) as Assign[]);
    setStudents((s.data ?? []) as Student[]); setYears(yr);
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

  const seats = (routeId: string) => vehicles.filter((v) => v.route_id === routeId && v.is_active).reduce((s, v) => s + v.capacity, 0);
  const riders = (routeId: string) => assigns.filter((a) => a.route_id === routeId).length;
  const who = (id: string) => { const s = students.find((x) => x.id === id); return s ? `${s.last_name}, ${s.first_name} (${s.admission_number})` : "Unknown"; };
  const needle = find.trim().toLowerCase();
  const studentOptions = students.filter((s) => !needle || `${s.first_name} ${s.last_name} ${s.admission_number}`.toLowerCase().includes(needle)).slice(0, 200);

  async function addRoute(e: React.FormEvent) {
    e.preventDefault();
    const fee = rf.fee.trim() === "" || Number(rf.fee) === 0 ? 0 : toPesewas(rf.fee);
    if (fee === null) return setError("Enter a valid fee, for example 150 or 150.50.");
    if (await act(() => db.from("transport_routes").insert({ school_id: schoolId, name: rf.name.trim(), description: rf.description.trim() || null, fee_pesewas: fee }), "Route added.")) setRf({ name: "", fee: "", description: "" });
  }
  async function addVehicle(e: React.FormEvent) {
    e.preventDefault();
    const cap = Number(vf.capacity);
    if (!Number.isInteger(cap) || cap < 1) return setError("Capacity must be a whole number of seats.");
    if (await act(() => db.from("transport_vehicles").insert({ school_id: schoolId, plate_number: vf.plate.trim().toUpperCase(), capacity: cap, route_id: vf.route_id || null, driver_name: vf.driver.trim() || null, driver_phone: vf.phone.trim() || null }), "Vehicle added.")) setVf({ plate: "", capacity: "", route_id: "", driver: "", phone: "" });
  }
  async function assign(e: React.FormEvent) {
    e.preventDefault();
    if (await act(() => db.from("student_transport").insert({ school_id: schoolId, student_id: af.student_id, route_id: af.route_id, academic_year_id: af.year_id, pickup_point: af.pickup.trim() || null }), "Student assigned.")) setAf({ ...af, student_id: "", pickup: "" });
  }

  return (
    <div className="space-y-6">
      <Notice error={error} ok={ok} />
      <Tabs<Tab> value={tab} onChange={setTab} tabs={[{ id: "routes", label: `Routes & vehicles (${routes.length})` }, { id: "students", label: `Student transport (${assigns.length})` }]} />

      {tab === "routes" && (
        <section className="space-y-4">
          {canManage && <>
            <form onSubmit={addRoute} className={`${card} grid gap-3 md:grid-cols-5 md:items-end`}>
              <div className="md:col-span-2"><label className={label}>Route name</label><input className={field} required minLength={2} maxLength={120} value={rf.name} onChange={(e) => setRf({ ...rf, name: e.target.value })} /></div>
              <div><label className={label}>Fee per term (GHS)</label><input className={field} inputMode="decimal" value={rf.fee} onChange={(e) => setRf({ ...rf, fee: e.target.value })} /></div>
              <div><label className={label}>Description</label><input className={field} maxLength={300} value={rf.description} onChange={(e) => setRf({ ...rf, description: e.target.value })} /></div>
              <button className={btn} disabled={busy}>Add route</button></form>
            <form onSubmit={addVehicle} className={`${card} grid gap-3 md:grid-cols-6 md:items-end`}>
              <div><label className={label}>Plate number</label><input className={field} required minLength={3} maxLength={20} value={vf.plate} onChange={(e) => setVf({ ...vf, plate: e.target.value })} /></div>
              <div><label className={label}>Seats</label><input className={field} required inputMode="numeric" value={vf.capacity} onChange={(e) => setVf({ ...vf, capacity: e.target.value })} /></div>
              <div><label className={label}>Route</label><select className={field} value={vf.route_id} onChange={(e) => setVf({ ...vf, route_id: e.target.value })}><option value="">Unassigned</option>{routes.filter((r) => r.is_active).map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}</select></div>
              <div><label className={label}>Driver</label><input className={field} maxLength={120} value={vf.driver} onChange={(e) => setVf({ ...vf, driver: e.target.value })} /></div>
              <div><label className={label}>Driver phone</label><input className={field} inputMode="tel" value={vf.phone} onChange={(e) => setVf({ ...vf, phone: e.target.value })} /></div>
              <button className={btn} disabled={busy}>Add vehicle</button></form></>}
          {routes.length === 0 ? <Empty>No routes yet.</Empty> : routes.map((r) => (
            <div key={r.id} className={`${card} p-0`}>
              <div className="flex flex-wrap items-center justify-between gap-2 border-b px-4 py-3"><div><h3 className="font-semibold">{r.name}{!r.is_active && <span className="ml-2 text-xs text-amber-700">inactive</span>}</h3><p className="text-xs text-slate-500">{r.description} {r.fee_pesewas > 0 && `· ${ghs(r.fee_pesewas)} per term`}</p></div>
                <div className="flex items-center gap-3 text-sm"><span>{riders(r.id)} riders{seats(r.id) > 0 ? ` / ${seats(r.id)} seats` : ""}</span>
                  {canManage && <button className={btnLight} disabled={busy} onClick={() => act(() => db.from("transport_routes").update({ is_active: !r.is_active }).eq("school_id", schoolId).eq("id", r.id), "Updated.")}>{r.is_active ? "Deactivate" : "Activate"}</button>}</div></div>
              {vehicles.filter((v) => v.route_id === r.id).length === 0 ? <p className="px-4 py-3 text-sm text-slate-500">No vehicles on this route.</p> :
                <table className="w-full"><tbody>{vehicles.filter((v) => v.route_id === r.id).map((v) => <tr key={v.id} className="border-b last:border-0"><td className={td}>{v.plate_number}</td><td className={td}>{v.capacity} seats</td><td className={td}>{v.driver_name ?? "—"} {v.driver_phone && <span className="text-xs text-slate-500">{v.driver_phone}</span>}</td>
                  <td className={`${td} text-right`}>{canManage && <button className={btnLight} disabled={busy} onClick={() => act(() => db.from("transport_vehicles").update({ is_active: !v.is_active }).eq("school_id", schoolId).eq("id", v.id), "Updated.")}>{v.is_active ? "Retire" : "Restore"}</button>}</td></tr>)}</tbody></table>}
            </div>))}
          {vehicles.some((v) => !v.route_id) && <p className="text-sm text-slate-600">Vehicles without a route: {vehicles.filter((v) => !v.route_id).map((v) => v.plate_number).join(", ")}</p>}
        </section>)}

      {tab === "students" && (
        <section className="space-y-4">
          {canManage && <form onSubmit={assign} className={`${card} grid gap-3 md:grid-cols-5 md:items-end`}>
            <div><label className={label}>Find student</label><input className={field} placeholder="Name or admission no." value={find} onChange={(e) => setFind(e.target.value)} /></div>
            <div><label className={label}>Student</label><select className={field} required value={af.student_id} onChange={(e) => setAf({ ...af, student_id: e.target.value })}><option value="">Choose…</option>{studentOptions.map((s) => <option key={s.id} value={s.id}>{s.last_name}, {s.first_name} ({s.admission_number})</option>)}</select></div>
            <div><label className={label}>Route</label><select className={field} required value={af.route_id} onChange={(e) => setAf({ ...af, route_id: e.target.value })}><option value="">Choose…</option>{routes.filter((r) => r.is_active).map((r) => <option key={r.id} value={r.id}>{r.name} ({riders(r.id)}{seats(r.id) ? `/${seats(r.id)}` : ""})</option>)}</select></div>
            <div><label className={label}>Pickup point</label><input className={field} maxLength={160} value={af.pickup} onChange={(e) => setAf({ ...af, pickup: e.target.value })} /></div>
            <div><label className={label}>Year</label><select className={field} value={af.year_id} onChange={(e) => setAf({ ...af, year_id: e.target.value })}>{years.map((y) => <option key={y.id} value={y.id}>{y.name}</option>)}</select></div>
            <div className="md:col-span-5"><button className={btn} disabled={busy}>Assign to route</button></div></form>}
          {assigns.length === 0 ? <Empty>No students use school transport yet.</Empty> : <div className={`${card} overflow-x-auto p-0`}><table className="w-full"><thead className="border-b"><tr><th className={th}>Student</th><th className={th}>Route</th><th className={th}>Pickup</th><th /></tr></thead>
            <tbody>{assigns.map((a) => <tr key={a.id} className="border-b last:border-0"><td className={td}>{who(a.student_id)}</td><td className={td}>{routes.find((r) => r.id === a.route_id)?.name}</td><td className={td}>{a.pickup_point ?? "—"}</td>
              <td className={`${td} text-right`}>{canManage && <button className={btnLight} disabled={busy} onClick={() => act(() => db.from("student_transport").update({ status: "ended" }).eq("school_id", schoolId).eq("id", a.id), "Student removed from the route.")}>End</button>}</td></tr>)}</tbody></table></div>}
        </section>)}
    </div>
  );
}
