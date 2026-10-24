"use client";

import { useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { dbMessage, downloadCsv, ghs, money2, today } from "@/lib/format";
import { btn, card, field, label } from "@/components/ui/styles";
import Notice from "@/components/ui/Notice";

type Journal = { entry_date: string; reference: string; source: string; account: string; debit_pesewas: number; credit_pesewas: number; description: string | null };
const LIMIT = 20000;

export default function AccountingExport({ schoolId }: { schoolId: string }) {
  const db = useMemo(() => createClient(), []);
  const [from, setFrom] = useState(`${today().slice(0, 8)}01`);
  const [to, setTo] = useState(today());
  const [error, setError] = useState("");
  const [ok, setOk] = useState("");
  const [busy, setBusy] = useState(false);

  async function journal(): Promise<Journal[] | null> {
    const { data, error: err } = await db.from("accounting_journal").select("entry_date,reference,source,account,debit_pesewas,credit_pesewas,description")
      .eq("school_id", schoolId).gte("entry_date", from).lte("entry_date", to).order("entry_date").order("reference").limit(LIMIT + 1);
    if (err) { setError(dbMessage(err, "Unable to build the export.")); return null; }
    const rows = (data ?? []) as Journal[];
    if (rows.length > LIMIT) { setError(`That range has more than ${LIMIT} lines. Choose a shorter date range.`); return null; }
    return rows;
  }

  async function run(kind: "journal" | "payments" | "invoices" | "expenses") {
    setError(""); setOk(""); setBusy(true);
    try {
      if (from > to) return setError("The start date is after the end date.");
      if (kind === "journal") {
        const rows = await journal(); if (!rows) return;
        const debit = rows.reduce((s, r) => s + Number(r.debit_pesewas), 0), credit = rows.reduce((s, r) => s + Number(r.credit_pesewas), 0);
        downloadCsv(`journal_${from}_to_${to}.csv`, [["Date", "Reference", "Source", "Account", "Debit (GHS)", "Credit (GHS)", "Description"],
          ...rows.map((r) => [r.entry_date, r.reference, r.source, r.account, money2(Number(r.debit_pesewas)), money2(Number(r.credit_pesewas)), r.description])]);
        setOk(`${rows.length} journal lines exported. Total debits ${ghs(debit)} and credits ${ghs(credit)}${debit === credit ? " (balanced)." : " DO NOT MATCH, contact support."}`);
      } else if (kind === "payments") {
        const [p, inv, st] = await Promise.all([
          db.from("payments").select("receipt_number,paid_on,invoice_id,method,reference,amount_pesewas").eq("school_id", schoolId).gte("paid_on", from).lte("paid_on", to).order("paid_on").limit(LIMIT),
          db.from("invoice_balances").select("invoice_id,invoice_number,student_id").eq("school_id", schoolId).limit(LIMIT),
          db.from("students").select("id,first_name,last_name,admission_number").eq("school_id", schoolId).limit(LIMIT),
        ]);
        if (p.error || inv.error || st.error) return setError("Unable to build the export.");
        const iv = new Map(((inv.data ?? []) as { invoice_id: string; invoice_number: string; student_id: string }[]).map((x) => [x.invoice_id, x]));
        const sm = new Map(((st.data ?? []) as { id: string; first_name: string; last_name: string; admission_number: string }[]).map((x) => [x.id, x]));
        const rows = (p.data ?? []) as { receipt_number: string; paid_on: string; invoice_id: string; method: string; reference: string | null; amount_pesewas: number }[];
        downloadCsv(`payments_${from}_to_${to}.csv`, [["Receipt", "Date", "Invoice", "Admission no.", "Student", "Method", "Reference", "Amount (GHS)"],
          ...rows.map((r) => { const i = iv.get(r.invoice_id); const s = i ? sm.get(i.student_id) : undefined; return [r.receipt_number, r.paid_on, i?.invoice_number, s?.admission_number, s ? `${s.first_name} ${s.last_name}` : "", r.method, r.reference, money2(r.amount_pesewas)]; })]);
        setOk(`${rows.length} payment(s) exported, total ${ghs(rows.reduce((s, r) => s + r.amount_pesewas, 0))}.`);
      } else if (kind === "invoices") {
        const [b, st] = await Promise.all([
          db.from("invoice_balances").select("invoice_number,student_id,issued_on,due_on,status,total_pesewas,paid_pesewas").eq("school_id", schoolId).gte("issued_on", from).lte("issued_on", to).order("issued_on").limit(LIMIT),
          db.from("students").select("id,first_name,last_name,admission_number").eq("school_id", schoolId).limit(LIMIT),
        ]);
        if (b.error || st.error) return setError("Unable to build the export.");
        const sm = new Map(((st.data ?? []) as { id: string; first_name: string; last_name: string; admission_number: string }[]).map((x) => [x.id, x]));
        const rows = (b.data ?? []) as { invoice_number: string; student_id: string; issued_on: string; due_on: string | null; status: string; total_pesewas: number; paid_pesewas: number }[];
        downloadCsv(`invoices_${from}_to_${to}.csv`, [["Invoice", "Admission no.", "Student", "Issued", "Due", "Status", "Total (GHS)", "Paid (GHS)", "Balance (GHS)"],
          ...rows.map((r) => { const s = sm.get(r.student_id); return [r.invoice_number, s?.admission_number, s ? `${s.first_name} ${s.last_name}` : "", r.issued_on, r.due_on, r.status, money2(r.total_pesewas), money2(r.paid_pesewas), money2(r.total_pesewas - r.paid_pesewas)]; })]);
        setOk(`${rows.length} invoice(s) exported.`);
      } else {
        const { data, error: err } = await db.from("expenses").select("spent_on,category,description,amount_pesewas").eq("school_id", schoolId).gte("spent_on", from).lte("spent_on", to).order("spent_on").limit(LIMIT);
        if (err) return setError("Unable to build the export.");
        const rows = (data ?? []) as { spent_on: string; category: string; description: string; amount_pesewas: number }[];
        downloadCsv(`expenses_${from}_to_${to}.csv`, [["Date", "Category", "Description", "Amount (GHS)"], ...rows.map((r) => [r.spent_on, r.category, r.description, money2(r.amount_pesewas)])]);
        setOk(`${rows.length} expense(s) exported, total ${ghs(rows.reduce((s, r) => s + r.amount_pesewas, 0))}.`);
      }
    } finally { setBusy(false); }
  }

  return (
    <div className="space-y-5">
      <Notice error={error} ok={ok} />
      <div className={`${card} grid gap-3 md:grid-cols-4 md:items-end`}>
        <div><label className={label}>From</label><input type="date" className={field} value={from} max={to} onChange={(e) => setFrom(e.target.value)} /></div>
        <div><label className={label}>To</label><input type="date" className={field} value={to} min={from} onChange={(e) => setTo(e.target.value)} /></div>
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        <div className={card}><h3 className="font-semibold">General journal</h3><p className="mt-1 text-sm text-slate-600">Balanced debit and credit lines for invoices, payments and expenses. Import into Zoho Books, QuickBooks, Sage or Excel.</p><button className={`${btn} mt-3`} disabled={busy} onClick={() => run("journal")}>Download journal CSV</button></div>
        <div className={card}><h3 className="font-semibold">Payments received</h3><p className="mt-1 text-sm text-slate-600">Every receipt in the range with student, invoice and method.</p><button className={`${btn} mt-3`} disabled={busy} onClick={() => run("payments")}>Download payments CSV</button></div>
        <div className={card}><h3 className="font-semibold">Invoices</h3><p className="mt-1 text-sm text-slate-600">Invoices issued in the range with paid amount and balance.</p><button className={`${btn} mt-3`} disabled={busy} onClick={() => run("invoices")}>Download invoices CSV</button></div>
        <div className={card}><h3 className="font-semibold">Expenses</h3><p className="mt-1 text-sm text-slate-600">Recorded expenses in the range.</p><button className={`${btn} mt-3`} disabled={busy} onClick={() => run("expenses")}>Download expenses CSV</button></div>
      </div>
    </div>
  );
}
