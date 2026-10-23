"use client";

import { useCallback, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { useRun } from "@/lib/useRun";
import { dbMessage, ghs, today } from "@/lib/format";
import { btn, card, field, label } from "@/components/ui/styles";
import Notice from "@/components/ui/Notice";

type Overview = {
  students_active: number; staff_active: number;
  enrollment_by_class: { class: string; students: number }[];
  attendance: Record<string, number>;
  finance?: { collected_pesewas: number; expenses_pesewas: number; billed_pesewas: number; outstanding_pesewas: number; by_method: Record<string, number> };
  grades?: { term_id: string | null; distribution: Record<string, number> };
};
const METHOD_LABEL: Record<string, string> = { cash: "Cash", mobile_money: "Mobile money", bank: "Bank", card: "Card", cheque: "Cheque" };

function Bars({ rows, format }: { rows: { label: string; value: number }[]; format?: (n: number) => string }) {
  const max = Math.max(1, ...rows.map((r) => r.value));
  if (rows.length === 0) return <p className="text-sm text-slate-500">No data for this period.</p>;
  return (
    <ul className="space-y-2">{rows.map((r) => (
      <li key={r.label}><div className="flex justify-between text-sm"><span>{r.label}</span><span className="font-semibold">{format ? format(r.value) : r.value}</span></div>
        <div className="mt-1 h-2 rounded-full bg-slate-100"><div className="h-2 rounded-full bg-blue-700" style={{ width: `${(r.value / max) * 100}%` }} /></div></li>))}</ul>
  );
}
const Stat = ({ title, value, tone = "" }: { title: string; value: string; tone?: string }) => (
  <div className={card}><p className="text-sm text-slate-500">{title}</p><p className={`mt-1 text-2xl font-bold ${tone}`}>{value}</p></div>
);

export default function ReportsDashboard({ schoolId }: { schoolId: string }) {
  const db = useMemo(() => createClient(), []);
  const monthStart = `${today().slice(0, 8)}01`;
  const [from, setFrom] = useState(monthStart);
  const [to, setTo] = useState(today());
  const [data, setData] = useState<Overview | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setBusy(true); setError("");
    const { data: d, error: e } = await db.rpc("report_overview", { p_school_id: schoolId, p_from: from, p_to: to });
    setBusy(false);
    if (e) return setError(dbMessage(e, "Unable to load the report."));
    setData(d as Overview);
  }, [db, schoolId, from, to]);
  useRun(load);

  const att = data?.attendance ?? {};
  const marked = Object.values(att).reduce((s, n) => s + n, 0);
  const presentish = (att.present ?? 0) + (att.late ?? 0);
  const rate = marked ? Math.round((presentish / marked) * 1000) / 10 : null;
  const fin = data?.finance;

  return (
    <div className="space-y-6">
      <Notice error={error} />
      <div className={`${card} grid gap-3 md:grid-cols-4 md:items-end`}>
        <div><label className={label}>From</label><input type="date" className={field} value={from} max={to} onChange={(e) => setFrom(e.target.value)} /></div>
        <div><label className={label}>To</label><input type="date" className={field} value={to} min={from} max={today()} onChange={(e) => setTo(e.target.value)} /></div>
        <div><button className={btn} disabled={busy} onClick={load}>{busy ? "Loading…" : "Refresh"}</button></div>
      </div>

      {data && <>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Stat title="Active students" value={String(data.students_active)} />
          <Stat title="Active staff" value={String(data.staff_active)} />
          <Stat title="Attendance rate" value={rate === null ? "—" : `${rate}%`} tone={rate !== null && rate < 85 ? "text-red-700" : "text-green-700"} />
          <Stat title="Absences recorded" value={String(att.absent ?? 0)} />
        </div>

        {fin && <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Stat title="Billed (invoices issued)" value={ghs(fin.billed_pesewas)} />
          <Stat title="Collected" value={ghs(fin.collected_pesewas)} tone="text-green-700" />
          <Stat title="Expenses" value={ghs(fin.expenses_pesewas)} tone="text-amber-700" />
          <Stat title="Outstanding (all time)" value={ghs(fin.outstanding_pesewas)} tone="text-red-700" />
        </div>}

        <div className="grid gap-5 lg:grid-cols-2">
          <div className={card}><h3 className="mb-3 font-semibold">Enrolment by class</h3><Bars rows={data.enrollment_by_class.map((r) => ({ label: r.class, value: r.students }))} /></div>
          <div className={card}><h3 className="mb-3 font-semibold">Attendance</h3><Bars rows={["present", "late", "excused", "absent"].filter((k) => att[k]).map((k) => ({ label: k[0].toUpperCase() + k.slice(1), value: att[k] }))} /></div>
          {fin && <div className={card}><h3 className="mb-3 font-semibold">Collections by method</h3><Bars rows={Object.entries(fin.by_method).map(([k, v]) => ({ label: METHOD_LABEL[k] ?? k, value: Number(v) }))} format={ghs} /></div>}
          {data.grades && <div className={card}><h3 className="mb-3 font-semibold">Grade distribution (active term)</h3>
            <Bars rows={Object.entries(data.grades.distribution).sort(([a], [b]) => a.localeCompare(b)).map(([k, v]) => ({ label: k, value: Number(v) }))} /></div>}
        </div>
      </>}
    </div>
  );
}
