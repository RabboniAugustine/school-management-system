"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { useRun } from "@/lib/useRun";
import { dbMessage, daysBetween, downloadCsv, esc, fmtDate, ghs, money2, printHtml, toPesewas, today } from "@/lib/format";
import { btn, btnLight, card, field, label, td, th } from "@/components/ui/styles";
import Tabs from "@/components/ui/Tabs";
import Notice from "@/components/ui/Notice";
import Empty from "@/components/ui/Empty";

type Staff = { id: string; first_name: string; last_name: string; job_title: string | null };
type Leave = { id: string; staff_id: string; leave_type: string; starts_on: string; ends_on: string; reason: string | null; status: string };
type Comp = { staff_id: string; basic_pesewas: number; allowances_pesewas: number; deductions_pesewas: number };
type Run = { id: string; period_month: string; status: string };
type Slip = { id: string; staff_id: string; basic_pesewas: number; allowances_pesewas: number; deductions_pesewas: number; net_pesewas: number };
type Tab = "leave" | "compensation" | "payroll";
const LEAVE_TYPES = [["annual", "Annual"], ["sick", "Sick"], ["maternity", "Maternity"], ["paternity", "Paternity"], ["study", "Study"], ["unpaid", "Unpaid"], ["other", "Other"]] as const;
const STATUS_STYLE: Record<string, string> = { pending: "bg-amber-100 text-amber-800", approved: "bg-green-100 text-green-800", rejected: "bg-red-100 text-red-800", cancelled: "bg-slate-100 text-slate-600", draft: "bg-amber-100 text-amber-800", paid: "bg-green-100 text-green-800" };
const monthLabel = (d: string) => new Date(`${d}T00:00:00`).toLocaleDateString("en-GB", { month: "long", year: "numeric" });

export default function HRManager({ schoolId, schoolName, canLeave, canManageLeave, canPayroll, canManagePayroll }: {
  schoolId: string; schoolName: string; canLeave: boolean; canManageLeave: boolean; canPayroll: boolean; canManagePayroll: boolean;
}) {
  const db = useMemo(() => createClient(), []);
  const first: Tab = canLeave || canManageLeave ? "leave" : "compensation";
  const [tab, setTab] = useState<Tab>(first);
  const [staff, setStaff] = useState<Staff[]>([]);
  const [myStaffId, setMyStaffId] = useState<string | null>(null);
  const [leaves, setLeaves] = useState<Leave[]>([]);
  const [comps, setComps] = useState<Record<string, { basic: string; allow: string; deduct: string }>>({});
  const [runs, setRuns] = useState<Run[]>([]);
  const [runId, setRunId] = useState("");
  const [slips, setSlips] = useState<Slip[]>([]);
  const [month, setMonth] = useState(today().slice(0, 7));
  const [error, setError] = useState("");
  const [ok, setOk] = useState("");
  const [busy, setBusy] = useState(false);
  const [lf, setLf] = useState({ staff_id: "", leave_type: "annual", starts_on: today(), ends_on: today(), reason: "" });

  const load = useCallback(async () => {
    const [s, me, l] = await Promise.all([
      db.from("staff_members").select("id,first_name,last_name,job_title").eq("school_id", schoolId).order("last_name"),
      db.rpc("my_staff_id", { p_school_id: schoolId }),
      db.from("leave_requests").select("id,staff_id,leave_type,starts_on,ends_on,reason,status").eq("school_id", schoolId).order("starts_on", { ascending: false }).limit(300),
    ]);
    setStaff((s.data ?? []) as Staff[]); setMyStaffId((me.data as string | null) ?? null); setLeaves((l.data ?? []) as Leave[]);
    if (canPayroll) {
      const [c, r] = await Promise.all([
        db.from("staff_compensation").select("staff_id,basic_pesewas,allowances_pesewas,deductions_pesewas").eq("school_id", schoolId),
        db.from("payroll_runs").select("id,period_month,status").eq("school_id", schoolId).order("period_month", { ascending: false }),
      ]);
      const map: Record<string, { basic: string; allow: string; deduct: string }> = {};
      for (const row of (c.data ?? []) as Comp[]) map[row.staff_id] = { basic: (row.basic_pesewas / 100).toFixed(2), allow: (row.allowances_pesewas / 100).toFixed(2), deduct: (row.deductions_pesewas / 100).toFixed(2) };
      setComps(map); setRuns((r.data ?? []) as Run[]);
    }
  }, [db, schoolId, canPayroll]);
  useRun(load);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      if (!runId) { setSlips([]); return; }
      void db.from("payslips").select("id,staff_id,basic_pesewas,allowances_pesewas,deductions_pesewas,net_pesewas").eq("school_id", schoolId).eq("run_id", runId).then(({ data }) => setSlips((data ?? []) as Slip[]));
    }, 0);
    return () => window.clearTimeout(timer);
  }, [db, schoolId, runId, runs]);

  const name = (id: string) => { const s = staff.find((x) => x.id === id); return s ? `${s.first_name} ${s.last_name}` : id === myStaffId ? "Me" : "Staff member"; };

  async function act(fn: () => PromiseLike<{ error: { message?: string; code?: string } | null; data?: unknown }>, success: string) {
    setError(""); setOk(""); setBusy(true);
    const res = await fn();
    setBusy(false);
    if (res.error) { setError(dbMessage(res.error)); return null; }
    setOk(success); await load(); return res;
  }

  async function requestLeave(e: React.FormEvent) {
    e.preventDefault();
    const staffId = canManageLeave ? lf.staff_id : myStaffId;
    if (!staffId) return setError(canManageLeave ? "Choose a staff member." : "Your login is not linked to a staff record. Ask an administrator to link it.");
    if (lf.ends_on < lf.starts_on) return setError("The end date is before the start date.");
    await act(() => db.from("leave_requests").insert({ school_id: schoolId, staff_id: staffId, leave_type: lf.leave_type, starts_on: lf.starts_on, ends_on: lf.ends_on, reason: lf.reason.trim() || null }), "Leave request submitted.");
  }

  async function saveComp(staffId: string) {
    const c = comps[staffId]; if (!c) return;
    const basic = c.basic.trim() === "0" ? 0 : toPesewas(c.basic);
    const allow = !c.allow.trim() || Number(c.allow) === 0 ? 0 : toPesewas(c.allow);
    const deduct = !c.deduct.trim() || Number(c.deduct) === 0 ? 0 : toPesewas(c.deduct);
    if (basic === null || allow === null || deduct === null) return setError("Enter valid amounts, for example 2500 or 2500.50.");
    if (deduct > basic + allow) return setError("Deductions cannot be more than basic pay plus allowances.");
    await act(() => db.from("staff_compensation").upsert({ school_id: schoolId, staff_id: staffId, basic_pesewas: basic, allowances_pesewas: allow, deductions_pesewas: deduct }, { onConflict: "school_id,staff_id" }), `Saved pay for ${name(staffId)}.`);
  }

  function printSlip(s: Slip, run: Run) {
    printHtml(`Payslip - ${name(s.staff_id)}`, `<div class="row"><div><h1>${esc(schoolName)}</h1><div class="muted">Payslip</div></div><div class="r">${esc(monthLabel(run.period_month))}</div></div>
      <h2>${esc(name(s.staff_id))}</h2><table><tr><th>Item</th><th class="r">Amount</th></tr><tr><td>Basic pay</td><td class="r">${esc(ghs(s.basic_pesewas))}</td></tr>
      <tr><td>Allowances</td><td class="r">${esc(ghs(s.allowances_pesewas))}</td></tr><tr><td>Deductions</td><td class="r">- ${esc(ghs(s.deductions_pesewas))}</td></tr>
      <tr><td><b>Net pay</b></td><td class="r"><b>${esc(ghs(s.net_pesewas))}</b></td></tr></table>`);
  }

  const run = runs.find((r) => r.id === runId);
  const tabs: { id: Tab; label: string }[] = [
    ...(canLeave || canManageLeave ? [{ id: "leave" as Tab, label: `Leave (${leaves.filter((l) => l.status === "pending").length} pending)` }] : []),
    ...(canPayroll ? [{ id: "compensation" as Tab, label: "Pay setup" }, { id: "payroll" as Tab, label: "Payroll runs" }] : []),
  ];

  return (
    <div className="space-y-6">
      <Notice error={error} ok={ok} />
      <Tabs<Tab> value={tab} onChange={setTab} tabs={tabs} />

      {tab === "leave" && (
        <section className="space-y-4">
          <form onSubmit={requestLeave} className={`${card} grid gap-3 md:grid-cols-5 md:items-end`}>
            {canManageLeave && <div><label className={label}>Staff member</label><select className={field} required value={lf.staff_id} onChange={(e) => setLf({ ...lf, staff_id: e.target.value })}><option value="">Choose…</option>{staff.map((s) => <option key={s.id} value={s.id}>{s.first_name} {s.last_name}</option>)}</select></div>}
            <div><label className={label}>Type</label><select className={field} value={lf.leave_type} onChange={(e) => setLf({ ...lf, leave_type: e.target.value })}>{LEAVE_TYPES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></div>
            <div><label className={label}>From</label><input type="date" className={field} required value={lf.starts_on} onChange={(e) => setLf({ ...lf, starts_on: e.target.value, ends_on: lf.ends_on < e.target.value ? e.target.value : lf.ends_on })} /></div>
            <div><label className={label}>To</label><input type="date" className={field} required min={lf.starts_on} value={lf.ends_on} onChange={(e) => setLf({ ...lf, ends_on: e.target.value })} /></div>
            <div><label className={label}>Reason</label><input className={field} maxLength={500} value={lf.reason} onChange={(e) => setLf({ ...lf, reason: e.target.value })} /></div>
            <div className="md:col-span-5"><button className={btn} disabled={busy}>{canManageLeave ? "Record leave" : "Request leave"}</button></div>
          </form>
          {leaves.length === 0 ? <Empty>No leave requests.</Empty> : <div className={`${card} overflow-x-auto p-0`}><table className="w-full"><thead className="border-b"><tr><th className={th}>Staff</th><th className={th}>Type</th><th className={th}>Dates</th><th className={th}>Status</th><th /></tr></thead>
            <tbody>{leaves.map((l) => <tr key={l.id} className="border-b last:border-0 align-top"><td className={td}>{name(l.staff_id)}{l.reason && <div className="text-xs text-slate-500">{l.reason}</div>}</td><td className={td}>{LEAVE_TYPES.find(([v]) => v === l.leave_type)?.[1]}</td>
              <td className={td}>{fmtDate(l.starts_on)} – {fmtDate(l.ends_on)}<div className="text-xs text-slate-500">{daysBetween(l.starts_on, l.ends_on) + 1} day(s)</div></td>
              <td className={td}><span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${STATUS_STYLE[l.status]}`}>{l.status}</span></td>
              <td className={`${td} text-right`}>{l.status === "pending" && <div className="flex justify-end gap-2">
                {canManageLeave && <><button className={btn} disabled={busy} onClick={() => act(() => db.from("leave_requests").update({ status: "approved" }).eq("school_id", schoolId).eq("id", l.id), "Leave approved.")}>Approve</button>
                  <button className={btnLight} disabled={busy} onClick={() => act(() => db.from("leave_requests").update({ status: "rejected" }).eq("school_id", schoolId).eq("id", l.id), "Leave rejected.")}>Reject</button></>}
                {l.staff_id === myStaffId && <button className={btnLight} disabled={busy} onClick={() => act(() => db.from("leave_requests").update({ status: "cancelled" }).eq("school_id", schoolId).eq("id", l.id), "Request cancelled.")}>Cancel</button>}</div>}</td></tr>)}</tbody></table></div>}
        </section>
      )}

      {tab === "compensation" && canPayroll && (
        <section className="space-y-3">
          <p className="text-sm text-slate-600">Monthly pay per staff member. These amounts are copied into each payroll run when it is created.</p>
          {staff.length === 0 ? <Empty>No staff records.</Empty> : <div className={`${card} overflow-x-auto p-0`}><table className="w-full"><thead className="border-b"><tr><th className={th}>Staff</th><th className={th}>Basic (GHS)</th><th className={th}>Allowances</th><th className={th}>Deductions</th><th /></tr></thead>
            <tbody>{staff.map((s) => { const c = comps[s.id] ?? { basic: "", allow: "", deduct: "" }; const set = (k: "basic" | "allow" | "deduct") => (e: React.ChangeEvent<HTMLInputElement>) => setComps({ ...comps, [s.id]: { ...c, [k]: e.target.value } });
              return <tr key={s.id} className="border-b last:border-0"><td className={td}>{s.first_name} {s.last_name}<div className="text-xs text-slate-500">{s.job_title}</div></td>
                <td className={td}><input className={`${field} w-32`} inputMode="decimal" disabled={!canManagePayroll} value={c.basic} onChange={set("basic")} /></td><td className={td}><input className={`${field} w-28`} inputMode="decimal" disabled={!canManagePayroll} value={c.allow} onChange={set("allow")} /></td><td className={td}><input className={`${field} w-28`} inputMode="decimal" disabled={!canManagePayroll} value={c.deduct} onChange={set("deduct")} /></td>
                <td className={`${td} text-right`}>{canManagePayroll && <button className={btnLight} disabled={busy || !c.basic} onClick={() => saveComp(s.id)}>Save</button>}</td></tr>; })}</tbody></table></div>}
        </section>
      )}

      {tab === "payroll" && canPayroll && (
        <section className="space-y-4">
          {canManagePayroll && <div className={`${card} flex flex-wrap items-end gap-3`}><div><label className={label}>Month</label><input type="month" className={field} value={month} onChange={(e) => setMonth(e.target.value)} /></div>
            <button className={btn} disabled={busy || !month} onClick={async () => { const r = await act(() => db.rpc("create_payroll_run", { p_school_id: schoolId, p_month: `${month}-01` }), "Payroll run created as a draft."); if (r && typeof r.data === "string") setRunId(r.data); }}>Create payroll run</button></div>}
          {runs.length === 0 ? <Empty>No payroll runs yet. Set up pay first, then create a run.</Empty> : <div className="flex flex-wrap gap-2">{runs.map((r) => <button key={r.id} onClick={() => setRunId(r.id)} className={`rounded-lg border px-3 py-2 text-sm ${runId === r.id ? "border-blue-800 bg-blue-50 font-semibold" : "border-slate-200 bg-white"}`}>{monthLabel(r.period_month)} · {r.status}</button>)}</div>}
          {run && <div className={`${card} p-0`}>
            <div className="flex flex-wrap items-center justify-between gap-3 border-b px-4 py-3"><div><h3 className="font-semibold">{monthLabel(run.period_month)}</h3><span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${STATUS_STYLE[run.status]}`}>{run.status}</span></div>
              <div className="flex gap-2">{canManagePayroll && run.status === "draft" && <button className={btn} disabled={busy} onClick={() => { if (confirm("Approve this run? Payslips can no longer be changed.")) void act(() => db.from("payroll_runs").update({ status: "approved" }).eq("school_id", schoolId).eq("id", run.id), "Payroll approved."); }}>Approve</button>}
                {canManagePayroll && run.status === "approved" && <button className={btn} disabled={busy} onClick={() => act(() => db.from("payroll_runs").update({ status: "paid" }).eq("school_id", schoolId).eq("id", run.id), "Marked as paid.")}>Mark as paid</button>}
                <button className={btnLight} onClick={() => downloadCsv(`payroll_${run.period_month.slice(0, 7)}.csv`, [["Month", "Staff", "Basic (GHS)", "Allowances (GHS)", "Deductions (GHS)", "Net (GHS)"], ...slips.map((s) => [run.period_month.slice(0, 7), name(s.staff_id), money2(s.basic_pesewas), money2(s.allowances_pesewas), money2(s.deductions_pesewas), money2(s.net_pesewas)])])}>Download CSV</button></div></div>
            <div className="overflow-x-auto"><table className="w-full"><thead className="border-b"><tr><th className={th}>Staff</th><th className={`${th} text-right`}>Basic</th><th className={`${th} text-right`}>Allowances</th><th className={`${th} text-right`}>Deductions</th><th className={`${th} text-right`}>Net</th><th /></tr></thead>
              <tbody>{slips.map((s) => <tr key={s.id} className="border-b"><td className={td}>{name(s.staff_id)}</td><td className={`${td} text-right`}>{ghs(s.basic_pesewas)}</td><td className={`${td} text-right`}>{ghs(s.allowances_pesewas)}</td><td className={`${td} text-right`}>{ghs(s.deductions_pesewas)}</td><td className={`${td} text-right font-semibold`}>{ghs(s.net_pesewas)}</td><td className={`${td} text-right`}><button className={btnLight} onClick={() => printSlip(s, run)}>Payslip</button></td></tr>)}
                <tr><td className={`${td} font-semibold`} colSpan={4}>Total net pay</td><td className={`${td} text-right font-bold`}>{ghs(slips.reduce((t, s) => t + s.net_pesewas, 0))}</td><td /></tr></tbody></table></div></div>}
        </section>
      )}
    </div>
  );
}
