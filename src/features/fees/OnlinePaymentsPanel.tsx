"use client";

import { useCallback, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { useRun } from "@/lib/useRun";
import { dbMessage, fmtDate, ghs } from "@/lib/format";
import { btn, card, field, label, td, th } from "@/components/ui/styles";
import Notice from "@/components/ui/Notice";
import Empty from "@/components/ui/Empty";

type Row = { id: string; invoice_id: string; reference: string; amount_pesewas: number; status: string; channel: string | null; failure_reason: string | null; needs_review: boolean; created_at: string };
const STATUS_STYLE: Record<string, string> = { pending: "bg-amber-100 text-amber-800", success: "bg-green-100 text-green-800", failed: "bg-red-100 text-red-800" };

export default function OnlinePaymentsPanel({ schoolId, canManage }: { schoolId: string; canManage: boolean }) {
  const db = useMemo(() => createClient(), []);
  const [rows, setRows] = useState<Row[]>([]);
  const [invoiceNo, setInvoiceNo] = useState<Record<string, string>>({});
  const [enabled, setEnabled] = useState(false);
  const [code, setCode] = useState("");
  const [error, setError] = useState("");
  const [ok, setOk] = useState("");
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const [s, p, b] = await Promise.all([
      db.from("school_payment_settings").select("online_enabled,paystack_subaccount_code").eq("school_id", schoolId).maybeSingle(),
      db.from("online_payments").select("id,invoice_id,reference,amount_pesewas,status,channel,failure_reason,needs_review,created_at").eq("school_id", schoolId).order("created_at", { ascending: false }).limit(200),
      db.from("invoice_balances").select("invoice_id,invoice_number").eq("school_id", schoolId).limit(2000),
    ]);
    if (p.error) return setError("Unable to load online payments.");
    const st = s.data as { online_enabled: boolean; paystack_subaccount_code: string | null } | null;
    setEnabled(Boolean(st?.online_enabled)); setCode(st?.paystack_subaccount_code ?? "");
    setRows((p.data ?? []) as Row[]);
    setInvoiceNo(Object.fromEntries(((b.data ?? []) as { invoice_id: string; invoice_number: string }[]).map((x) => [x.invoice_id, x.invoice_number])));
  }, [db, schoolId]);
  useRun(load);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setError(""); setOk("");
    const trimmed = code.trim();
    if (enabled && !/^ACCT_[A-Za-z0-9]{6,40}$/.test(trimmed)) return setError("Enter the Paystack subaccount code (it starts with ACCT_) before turning online payments on.");
    setBusy(true);
    const { error: err } = await db.from("school_payment_settings").upsert({ school_id: schoolId, online_enabled: enabled, paystack_subaccount_code: trimmed || null }, { onConflict: "school_id" });
    setBusy(false);
    if (err) return setError(dbMessage(err));
    setOk("Settings saved."); await load();
  }

  return (
    <div className="space-y-6">
      <Notice error={error} ok={ok} />
      <form onSubmit={save} className={`${card} space-y-3`}>
        <h3 className="font-semibold">Online payments (Paystack)</h3>
        <p className="text-sm text-slate-600">Parents can pay invoices with mobile money or card from the family portal. Money settles to this school&apos;s Paystack subaccount. Ask your platform administrator for the subaccount code.</p>
        <div className="grid gap-3 md:grid-cols-3 md:items-end">
          <div className="md:col-span-2"><label className={label}>Paystack subaccount code</label><input className={field} disabled={!canManage} placeholder="ACCT_xxxxxxxxxxxx" value={code} onChange={(e) => setCode(e.target.value)} /></div>
          <label className="flex items-center gap-2 pb-2 text-sm"><input type="checkbox" disabled={!canManage} checked={enabled} onChange={(e) => setEnabled(e.target.checked)} /> Accept online payments</label>
        </div>
        {canManage && <button className={btn} disabled={busy}>Save settings</button>}
      </form>
      {rows.length === 0 ? <Empty>No online payment attempts yet.</Empty> : (
        <div className={`${card} overflow-x-auto p-0`}><table className="w-full"><thead className="border-b"><tr><th className={th}>Started</th><th className={th}>Invoice</th><th className={th}>Reference</th><th className={`${th} text-right`}>Amount</th><th className={th}>Status</th></tr></thead>
          <tbody>{rows.map((r) => (
            <tr key={r.id} className="border-b last:border-0 align-top"><td className={td}>{fmtDate(r.created_at)}</td><td className={td}>{invoiceNo[r.invoice_id] ?? "—"}</td><td className={`${td} font-mono text-xs`}>{r.reference}</td><td className={`${td} text-right`}>{ghs(r.amount_pesewas)}</td>
              <td className={td}><span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${STATUS_STYLE[r.status]}`}>{r.status}</span>{r.channel && <span className="ml-2 text-xs text-slate-500">{r.channel}</span>}
                {r.needs_review && <div className="mt-1 text-xs font-semibold text-red-700">Needs review: {r.failure_reason}</div>}</td></tr>))}</tbody></table></div>)}
    </div>
  );
}
