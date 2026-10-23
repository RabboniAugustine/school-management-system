"use client";

import { Fragment, useCallback, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { useRun } from "@/lib/useRun";
import { daysBetween, dbMessage, esc, fmtDate, ghs, printHtml, toPesewas, today } from "@/lib/format";
import { btn, btnLight, card, field, label, td, th } from "@/components/ui/styles";
import Tabs from "@/components/ui/Tabs";
import Notice from "@/components/ui/Notice";
import Empty from "@/components/ui/Empty";

type Year = { id: string; name: string; status: string };
type Term = { id: string; name: string; academic_year_id: string; status: string };
type Cls = { id: string; name: string };
type Student = { id: string; first_name: string; last_name: string; admission_number: string };
type Structure = { id: string; academic_year_id: string; term_id: string | null; class_id: string | null; name: string; amount_pesewas: number; is_active: boolean };
type Balance = { invoice_id: string; student_id: string; academic_year_id: string; term_id: string | null; invoice_number: string; issued_on: string; due_on: string | null; status: string; total_pesewas: number; paid_pesewas: number };
type Expense = { id: string; category: string; description: string; amount_pesewas: number; spent_on: string };
type Tab = "invoices" | "structures" | "expenses" | "arrears";
type DbResult<T> = { error: { message?: string; code?: string } | null; data?: T | null };

const METHODS = [
  ["cash", "Cash"], ["mobile_money", "Mobile money"], ["bank", "Bank transfer"], ["card", "Card"], ["cheque", "Cheque"],
] as const;

/** Receipt numbers are unique per school (database constraint); the random suffix avoids clashes between cashiers. */
function newReceiptNumber(): string {
  return `RCT-${today().replaceAll("-", "")}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`;
}

export default function FeesManager({ schoolId, schoolName, canManage }: { schoolId: string; schoolName: string; canManage: boolean }) {
  const db = useMemo(() => createClient(), []);
  const [tab, setTab] = useState<Tab>("invoices");
  const [years, setYears] = useState<Year[]>([]);
  const [terms, setTerms] = useState<Term[]>([]);
  const [classes, setClasses] = useState<Cls[]>([]);
  const [students, setStudents] = useState<Student[]>([]);
  const [structures, setStructures] = useState<Structure[]>([]);
  const [balances, setBalances] = useState<Balance[]>([]);
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [error, setError] = useState("");
  const [ok, setOk] = useState("");
  const [busy, setBusy] = useState(false);

  const [yearId, setYearId] = useState("");
  const [termId, setTermId] = useState("");
  const [classId, setClassId] = useState("");
  const [dueOn, setDueOn] = useState("");
  const [search, setSearch] = useState("");

  const [sf, setSf] = useState({ name: "", amount: "", term: "", cls: "" });
  const [payFor, setPayFor] = useState<string | null>(null);
  const [pay, setPay] = useState({ amount: "", method: "cash", reference: "", paid_on: today() });
  const [ef, setEf] = useState({ category: "", description: "", amount: "", spent_on: today() });

  const load = useCallback(async () => {
    const [y, t, c, s, f, b, e] = await Promise.all([
      db.from("academic_years").select("id,name,status").eq("school_id", schoolId).order("starts_on", { ascending: false }),
      db.from("terms").select("id,name,academic_year_id,status").eq("school_id", schoolId).order("starts_on"),
      db.from("school_classes").select("id,name").eq("school_id", schoolId).eq("is_active", true).order("level_order"),
      db.from("students").select("id,first_name,last_name,admission_number").eq("school_id", schoolId).order("last_name").limit(2000),
      db.from("fee_structures").select("*").eq("school_id", schoolId).order("created_at", { ascending: false }),
      db.from("invoice_balances").select("*").eq("school_id", schoolId).order("issued_on", { ascending: false }).limit(1000),
      db.from("expenses").select("id,category,description,amount_pesewas,spent_on").eq("school_id", schoolId).order("spent_on", { ascending: false }).limit(300),
    ]);
    if (y.error || t.error || c.error || s.error || f.error || b.error || e.error) { setError("Unable to load finance data."); return; }
    const yearRows = (y.data ?? []) as Year[];
    setYears(yearRows); setTerms((t.data ?? []) as Term[]); setClasses((c.data ?? []) as Cls[]);
    setStudents((s.data ?? []) as Student[]); setStructures((f.data ?? []) as Structure[]);
    setBalances((b.data ?? []) as Balance[]); setExpenses((e.data ?? []) as Expense[]);
    setYearId((cur) => cur || (yearRows.find((r) => r.status === "active")?.id ?? yearRows[0]?.id ?? ""));
  }, [db, schoolId]);
  useRun(load);

  const studentName = useCallback((id: string) => {
    const s = students.find((x) => x.id === id);
    return s ? `${s.last_name}, ${s.first_name} (${s.admission_number})` : "Unknown student";
  }, [students]);
  const yearTerms = terms.filter((t) => t.academic_year_id === yearId);
  const termName = (id: string | null) => terms.find((t) => t.id === id)?.name ?? "Every term";

  async function run<T>(fn: () => PromiseLike<DbResult<T>>, success: string): Promise<{ ok: boolean; data: T | null }> {
    setError(""); setOk(""); setBusy(true);
    const res = await fn();
    setBusy(false);
    if (res.error) { setError(dbMessage(res.error)); return { ok: false, data: null }; }
    if (success) setOk(success);
    await load();
    return { ok: true, data: (res.data ?? null) as T | null };
  }

  async function addStructure(e: React.FormEvent) {
    e.preventDefault();
    const amount = toPesewas(sf.amount);
    if (!amount) return setError("Enter a valid amount, for example 1500 or 1500.50.");
    const r = await run(() => db.from("fee_structures").insert({
      school_id: schoolId, academic_year_id: yearId, term_id: sf.term || null, class_id: sf.cls || null, name: sf.name.trim(), amount_pesewas: amount,
    }), "Fee item added.");
    if (r.ok) setSf({ name: "", amount: "", term: "", cls: "" });
  }

  async function generate() {
    if (!yearId || !termId) return setError("Choose an academic year and a term first.");
    const r = await run<number>(() => db.rpc("generate_term_invoices", {
      p_school_id: schoolId, p_academic_year_id: yearId, p_term_id: termId, p_class_id: classId || null, p_due_on: dueOn || null,
    }), "");
    if (r.ok) setOk(r.data === 0 ? "No new invoices: every enrolled student is already billed, or no fee item matches." : `${r.data} invoice(s) generated.`);
  }

  async function printReceipt(b: Balance, receipt: string, amount: number) {
    const { data: lines } = await db.from("invoice_lines").select("description,amount_pesewas").eq("school_id", schoolId).eq("invoice_id", b.invoice_id);
    const { data: pays } = await db.from("payments").select("amount_pesewas").eq("school_id", schoolId).eq("invoice_id", b.invoice_id);
    const paid = (pays ?? []).reduce((s: number, p: { amount_pesewas: number }) => s + p.amount_pesewas, 0);
    const rows = (lines ?? []).map((l: { description: string; amount_pesewas: number }) => `<tr><td>${esc(l.description)}</td><td class="r">${esc(ghs(l.amount_pesewas))}</td></tr>`).join("");
    printHtml(`Receipt ${receipt}`, `<div class="row"><div><h1>${esc(schoolName)}</h1><div class="muted">Official receipt</div></div><div class="r"><b>${esc(receipt)}</b><br>${esc(fmtDate(today()))}</div></div>
      <h2>Received from</h2><p>${esc(studentName(b.student_id))}</p>
      <h2>Invoice ${esc(b.invoice_number)}</h2><table><tr><th>Description</th><th class="r">Amount</th></tr>${rows}
      <tr><td><b>Invoice total</b></td><td class="r"><b>${esc(ghs(b.total_pesewas))}</b></td></tr></table>
      <h2>This payment: ${esc(ghs(amount))}</h2><p>Total paid to date: ${esc(ghs(paid))}<br><b>Balance: ${esc(ghs(b.total_pesewas - paid))}</b></p>`);
  }

  async function recordPayment(b: Balance) {
    const amount = toPesewas(pay.amount);
    if (!amount) return setError("Enter a valid payment amount.");
    const outstanding = b.total_pesewas - b.paid_pesewas;
    if (amount > outstanding) return setError(`The payment is more than the balance of ${ghs(outstanding)}.`);
    const receipt = newReceiptNumber();
    const r = await run(() => db.from("payments").insert({
      school_id: schoolId, invoice_id: b.invoice_id, receipt_number: receipt, amount_pesewas: amount, method: pay.method,
      reference: pay.reference.trim() || null, paid_on: pay.paid_on,
    }), `Payment recorded. Receipt ${receipt}.`);
    if (r.ok) {
      setPayFor(null); setPay({ amount: "", method: "cash", reference: "", paid_on: today() });
      void printReceipt(b, receipt, amount);
    }
  }

  async function addExpense(e: React.FormEvent) {
    e.preventDefault();
    const amount = toPesewas(ef.amount);
    if (!amount) return setError("Enter a valid amount.");
    const r = await run(() => db.from("expenses").insert({ school_id: schoolId, category: ef.category.trim(), description: ef.description.trim(), amount_pesewas: amount, spent_on: ef.spent_on }), "Expense recorded.");
    if (r.ok) setEf({ category: "", description: "", amount: "", spent_on: today() });
  }

  const visibleBalances = balances.filter((b) =>
    (!yearId || b.academic_year_id === yearId) && (!termId || b.term_id === termId) &&
    (!search || studentName(b.student_id).toLowerCase().includes(search.toLowerCase()) || b.invoice_number.toLowerCase().includes(search.toLowerCase())));
  const totals = visibleBalances.reduce((a, b) => ({ billed: a.billed + b.total_pesewas, paid: a.paid + b.paid_pesewas }), { billed: 0, paid: 0 });

  const arrears = useMemo(() => {
    const map = new Map<string, { owed: number; oldestDue: string | null }>();
    for (const b of balances) {
      const owed = b.total_pesewas - b.paid_pesewas;
      if (b.status !== "open" || owed <= 0) continue;
      const cur = map.get(b.student_id) ?? { owed: 0, oldestDue: null };
      cur.owed += owed;
      const due = b.due_on ?? b.issued_on;
      if (!cur.oldestDue || due < cur.oldestDue) cur.oldestDue = due;
      map.set(b.student_id, cur);
    }
    return [...map.entries()].map(([id, v]) => ({ id, ...v })).sort((a, b) => b.owed - a.owed);
  }, [balances]);

  const yearStructures = structures.filter((s) => s.academic_year_id === yearId);

  return (
    <div className="space-y-6">
      <Notice error={error} ok={ok} />
      <Tabs<Tab> value={tab} onChange={setTab} tabs={[
        { id: "invoices", label: "Invoices & payments" }, { id: "structures", label: "Fee structure" },
        { id: "expenses", label: "Expenses" }, { id: "arrears", label: `Arrears (${arrears.length})` },
      ]} />

      {(tab === "invoices" || tab === "structures") && (
        <div className={`${card} grid gap-3 md:grid-cols-4`}>
          <div><label className={label}>Academic year</label>
            <select className={field} value={yearId} onChange={(e) => { setYearId(e.target.value); setTermId(""); }}>
              {years.map((y) => <option key={y.id} value={y.id}>{y.name}</option>)}</select></div>
          <div><label className={label}>Term</label>
            <select className={field} value={termId} onChange={(e) => setTermId(e.target.value)}>
              <option value="">All terms</option>{yearTerms.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}</select></div>
        </div>
      )}

      {tab === "structures" && (
        <section className="space-y-4">
          {canManage && (
            <form onSubmit={addStructure} className={`${card} grid gap-3 md:grid-cols-5 md:items-end`}>
              <div className="md:col-span-2"><label className={label}>Fee item</label><input className={field} required minLength={2} placeholder="Tuition" value={sf.name} onChange={(e) => setSf({ ...sf, name: e.target.value })} /></div>
              <div><label className={label}>Amount (GHS)</label><input className={field} required inputMode="decimal" placeholder="1500.00" value={sf.amount} onChange={(e) => setSf({ ...sf, amount: e.target.value })} /></div>
              <div><label className={label}>Term (optional)</label><select className={field} value={sf.term} onChange={(e) => setSf({ ...sf, term: e.target.value })}><option value="">Every term</option>{yearTerms.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}</select></div>
              <div><label className={label}>Class (optional)</label><select className={field} value={sf.cls} onChange={(e) => setSf({ ...sf, cls: e.target.value })}><option value="">All classes</option>{classes.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></div>
              <div className="md:col-span-5"><button className={btn} disabled={busy || !yearId}>Add fee item</button></div>
            </form>
          )}
          {yearStructures.length === 0 ? <Empty>No fee items for this year yet.</Empty> : (
            <div className={`${card} overflow-x-auto p-0`}><table className="w-full">
              <thead className="border-b"><tr><th className={th}>Item</th><th className={th}>Applies to</th><th className={`${th} text-right`}>Amount</th><th className={th}>Status</th><th /></tr></thead>
              <tbody>{yearStructures.map((s) => (
                <tr key={s.id} className="border-b last:border-0">
                  <td className={td}>{s.name}</td>
                  <td className={td}>{termName(s.term_id)} · {classes.find((c) => c.id === s.class_id)?.name ?? "All classes"}</td>
                  <td className={`${td} text-right`}>{ghs(s.amount_pesewas)}</td>
                  <td className={td}>{s.is_active ? "Active" : "Inactive"}</td>
                  <td className={`${td} text-right`}>{canManage && <button className={btnLight} onClick={() => run(() => db.from("fee_structures").update({ is_active: !s.is_active }).eq("school_id", schoolId).eq("id", s.id), "Updated.")}>{s.is_active ? "Deactivate" : "Activate"}</button>}</td>
                </tr>))}</tbody></table></div>
          )}
        </section>
      )}

      {tab === "invoices" && (
        <section className="space-y-4">
          {canManage && (
            <div className={`${card} grid gap-3 md:grid-cols-4 md:items-end`}>
              <div><label className={label}>Class (optional)</label><select className={field} value={classId} onChange={(e) => setClassId(e.target.value)}><option value="">All classes</option>{classes.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></div>
              <div><label className={label}>Due date (optional)</label><input type="date" className={field} value={dueOn} onChange={(e) => setDueOn(e.target.value)} /></div>
              <div className="md:col-span-2"><button className={btn} disabled={busy || !termId} onClick={generate}>Generate invoices for the selected term</button>
                {!termId && <p className="mt-1 text-xs text-slate-500">Pick a term above to bill it.</p>}</div>
            </div>
          )}
          <div className="grid gap-3 sm:grid-cols-3">
            <div className={card}><p className="text-sm text-slate-500">Billed</p><p className="mt-1 text-xl font-bold">{ghs(totals.billed)}</p></div>
            <div className={card}><p className="text-sm text-slate-500">Collected</p><p className="mt-1 text-xl font-bold text-green-700">{ghs(totals.paid)}</p></div>
            <div className={card}><p className="text-sm text-slate-500">Outstanding</p><p className="mt-1 text-xl font-bold text-red-700">{ghs(totals.billed - totals.paid)}</p></div>
          </div>
          <input className={field} placeholder="Search by student or invoice number" value={search} onChange={(e) => setSearch(e.target.value)} />
          {visibleBalances.length === 0 ? <Empty>No invoices match.</Empty> : (
            <div className={`${card} overflow-x-auto p-0`}><table className="w-full">
              <thead className="border-b"><tr><th className={th}>Invoice</th><th className={th}>Student</th><th className={`${th} text-right`}>Total</th><th className={`${th} text-right`}>Paid</th><th className={`${th} text-right`}>Balance</th><th /></tr></thead>
              <tbody>{visibleBalances.map((b) => {
                const bal = b.total_pesewas - b.paid_pesewas;
                return (
                  <Fragment key={b.invoice_id}>
                    <tr className="border-b">
                      <td className={td}>{b.invoice_number}<div className="text-xs text-slate-500">{fmtDate(b.issued_on)}{b.status === "cancelled" ? " · cancelled" : ""}</div></td>
                      <td className={td}>{studentName(b.student_id)}</td>
                      <td className={`${td} text-right`}>{ghs(b.total_pesewas)}</td>
                      <td className={`${td} text-right`}>{ghs(b.paid_pesewas)}</td>
                      <td className={`${td} text-right font-semibold ${bal > 0 ? "text-red-700" : "text-green-700"}`}>{bal > 0 ? ghs(bal) : "Paid"}</td>
                      <td className={`${td} text-right`}>{canManage && b.status === "open" && bal > 0 && <button className={btnLight} onClick={() => { setPayFor(payFor === b.invoice_id ? null : b.invoice_id); setPay({ ...pay, amount: (bal / 100).toFixed(2) }); }}>Record payment</button>}</td>
                    </tr>
                    {payFor === b.invoice_id && (
                      <tr className="border-b bg-slate-50"><td colSpan={6} className="p-4">
                        <div className="grid gap-3 md:grid-cols-5 md:items-end">
                          <div><label className={label}>Amount (GHS)</label><input className={field} inputMode="decimal" value={pay.amount} onChange={(e) => setPay({ ...pay, amount: e.target.value })} /></div>
                          <div><label className={label}>Method</label><select className={field} value={pay.method} onChange={(e) => setPay({ ...pay, method: e.target.value })}>{METHODS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></div>
                          <div><label className={label}>Reference (MoMo ID, slip no.)</label><input className={field} maxLength={100} value={pay.reference} onChange={(e) => setPay({ ...pay, reference: e.target.value })} /></div>
                          <div><label className={label}>Date paid</label><input type="date" className={field} value={pay.paid_on} max={today()} onChange={(e) => setPay({ ...pay, paid_on: e.target.value })} /></div>
                          <button className={btn} disabled={busy} onClick={() => recordPayment(b)}>Save and print receipt</button>
                        </div></td></tr>)}
                  </Fragment>
                );
              })}</tbody></table></div>
          )}
        </section>
      )}

      {tab === "expenses" && (
        <section className="space-y-4">
          {canManage && (
            <form onSubmit={addExpense} className={`${card} grid gap-3 md:grid-cols-5 md:items-end`}>
              <div><label className={label}>Category</label><input className={field} required minLength={2} placeholder="Utilities" value={ef.category} onChange={(e) => setEf({ ...ef, category: e.target.value })} /></div>
              <div className="md:col-span-2"><label className={label}>Description</label><input className={field} required minLength={2} value={ef.description} onChange={(e) => setEf({ ...ef, description: e.target.value })} /></div>
              <div><label className={label}>Amount (GHS)</label><input className={field} required inputMode="decimal" value={ef.amount} onChange={(e) => setEf({ ...ef, amount: e.target.value })} /></div>
              <div><label className={label}>Date</label><input type="date" className={field} value={ef.spent_on} max={today()} onChange={(e) => setEf({ ...ef, spent_on: e.target.value })} /></div>
              <div className="md:col-span-5"><button className={btn} disabled={busy}>Record expense</button></div>
            </form>
          )}
          <p className="text-sm text-slate-600">Total shown: <b>{ghs(expenses.reduce((s, e) => s + e.amount_pesewas, 0))}</b></p>
          {expenses.length === 0 ? <Empty>No expenses recorded.</Empty> : (
            <div className={`${card} overflow-x-auto p-0`}><table className="w-full"><thead className="border-b"><tr><th className={th}>Date</th><th className={th}>Category</th><th className={th}>Description</th><th className={`${th} text-right`}>Amount</th></tr></thead>
              <tbody>{expenses.map((e) => <tr key={e.id} className="border-b last:border-0"><td className={td}>{fmtDate(e.spent_on)}</td><td className={td}>{e.category}</td><td className={td}>{e.description}</td><td className={`${td} text-right`}>{ghs(e.amount_pesewas)}</td></tr>)}</tbody></table></div>
          )}
        </section>
      )}

      {tab === "arrears" && (
        arrears.length === 0 ? <Empty>No outstanding balances.</Empty> : (
          <div className={`${card} overflow-x-auto p-0`}><table className="w-full">
            <thead className="border-b"><tr><th className={th}>Student</th><th className={th}>Oldest due date</th><th className={th}>Days overdue</th><th className={`${th} text-right`}>Owed</th></tr></thead>
            <tbody>{arrears.map((a) => {
              const overdue = a.oldestDue ? Math.max(0, daysBetween(a.oldestDue, today())) : 0;
              return <tr key={a.id} className="border-b last:border-0"><td className={td}>{studentName(a.id)}</td><td className={td}>{fmtDate(a.oldestDue)}</td><td className={td}>{overdue}</td><td className={`${td} text-right font-semibold text-red-700`}>{ghs(a.owed)}</td></tr>;
            })}</tbody></table></div>)
      )}
    </div>
  );
}
