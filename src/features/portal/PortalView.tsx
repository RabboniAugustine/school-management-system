"use client";

import { Fragment, useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { useRun } from "@/lib/useRun";
import { fmtDate, ghs, toPesewas } from "@/lib/format";
import { btn, btnLight, card, field, label, td, th } from "@/components/ui/styles";
import Tabs from "@/components/ui/Tabs";
import Notice from "@/components/ui/Notice";
import Empty from "@/components/ui/Empty";

type Child = { id: string; first_name: string; last_name: string; admission_number: string };
type Enroll = { id: string; class_id: string; academic_year_id: string };
type Term = { id: string; name: string; academic_year_id: string; starts_on: string; ends_on: string; status: string };
type Bal = { invoice_id: string; invoice_number: string; issued_on: string; due_on: string | null; total_pesewas: number; paid_pesewas: number };
type Pay = { id: string; invoice_id: string; receipt_number: string; amount_pesewas: number; method: string; paid_on: string };
type Result = { subject_id: string; total_percent: number; grade: string | null; grade_remark: string | null };
type Notice_ = { id: string; title: string; body: string; created_at: string };
type Tab = "overview" | "fees" | "results" | "notices";

const PAYMENT_BANNER: Record<string, { ok?: string; error?: string }> = {
  success: { ok: "Payment received. Thank you! It now shows under Payments received." },
  pending: { ok: "Your payment is still being confirmed. Please check again in a minute." },
  review: { error: "We received your payment but could not apply it automatically. The school office will review it. Please keep your payment confirmation." },
  failed: { error: "The payment was not completed. You have not been charged." },
  error: { error: "We could not confirm that payment. If you were charged, contact the school office." },
};

export default function PortalView({ schoolId, slug }: { schoolId: string; slug: string }) {
  const paymentStatus = useSearchParams().get("payment");
  const [onlineEnabled, setOnlineEnabled] = useState(false);
  const [payInvoice, setPayInvoice] = useState<string | null>(null);
  const [payAmount, setPayAmount] = useState("");
  const [payBusy, setPayBusy] = useState(false);
  const [payError, setPayError] = useState("");
  const db = useMemo(() => createClient(), []);
  const [children, setChildren] = useState<Child[]>([]);
  const [childId, setChildId] = useState("");
  const [tab, setTab] = useState<Tab>("overview");
  const [error, setError] = useState("");
  const [loaded, setLoaded] = useState(false);
  const [classes, setClasses] = useState<Record<string, string>>({});
  const [subjects, setSubjects] = useState<Record<string, string>>({});
  const [terms, setTerms] = useState<Term[]>([]);
  const [enrolls, setEnrolls] = useState<Enroll[]>([]);
  const [att, setAtt] = useState<Record<string, number>>({});
  const [bals, setBals] = useState<Bal[]>([]);
  const [pays, setPays] = useState<Pay[]>([]);
  const [termId, setTermId] = useState("");
  const [results, setResults] = useState<Result[]>([]);
  const [rank, setRank] = useState<{ position: number; class_size: number; average_percent: number } | null>(null);
  const [notices, setNotices] = useState<Notice_[]>([]);

  const loadChildren = useCallback(async () => {
    const [st, cl, su, tm, an, ps] = await Promise.all([
      db.from("students").select("id,first_name,last_name,admission_number").eq("school_id", schoolId).order("first_name"),
      db.from("school_classes").select("id,name").eq("school_id", schoolId),
      db.from("school_subjects").select("id,name").eq("school_id", schoolId),
      db.from("terms").select("id,name,academic_year_id,starts_on,ends_on,status").eq("school_id", schoolId).order("starts_on", { ascending: false }),
      db.from("announcements").select("id,title,body,created_at").eq("school_id", schoolId).order("created_at", { ascending: false }).limit(30),
      db.from("school_payment_settings").select("online_enabled").eq("school_id", schoolId).maybeSingle(),
    ]);
    setOnlineEnabled(Boolean((ps.data as { online_enabled?: boolean } | null)?.online_enabled));
    if (st.error) setError("Unable to load your family's records.");
    const kids = (st.data ?? []) as Child[];
    setChildren(kids); setChildId((c) => c || kids[0]?.id || "");
    setClasses(Object.fromEntries(((cl.data ?? []) as { id: string; name: string }[]).map((c) => [c.id, c.name])));
    setSubjects(Object.fromEntries(((su.data ?? []) as { id: string; name: string }[]).map((s) => [s.id, s.name])));
    const termRows = (tm.data ?? []) as Term[];
    setTerms(termRows); setTermId((t) => t || termRows.find((r) => r.status === "active")?.id || termRows[0]?.id || "");
    setNotices((an.data ?? []) as Notice_[]);
    setLoaded(true);
  }, [db, schoolId]);
  useRun(loadChildren);

  const term = terms.find((t) => t.id === termId);

  useEffect(() => {
    if (!childId) return;
    void (async () => {
      const [en, bl] = await Promise.all([
        db.from("student_enrollments").select("id,class_id,academic_year_id").eq("school_id", schoolId).eq("student_id", childId),
        db.from("invoice_balances").select("invoice_id,invoice_number,issued_on,due_on,total_pesewas,paid_pesewas").eq("school_id", schoolId).eq("student_id", childId).order("issued_on", { ascending: false }),
      ]);
      setEnrolls((en.data ?? []) as Enroll[]); setBals((bl.data ?? []) as Bal[]);
      const ids = ((bl.data ?? []) as Bal[]).map((b) => b.invoice_id);
      if (ids.length) {
        const p = await db.from("payments").select("id,invoice_id,receipt_number,amount_pesewas,method,paid_on").eq("school_id", schoolId).in("invoice_id", ids).order("paid_on", { ascending: false });
        setPays((p.data ?? []) as Pay[]);
      } else setPays([]);
    })();
  }, [db, schoolId, childId]);

  const enrollmentForTerm = term ? enrolls.find((e) => e.academic_year_id === term.academic_year_id) : undefined;

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setAtt({}); setResults([]); setRank(null);
      if (!enrollmentForTerm || !term) return;
      void (async () => {
        const [a, r, k] = await Promise.all([
          db.from("student_attendance").select("status").eq("school_id", schoolId).eq("enrollment_id", enrollmentForTerm.id).gte("school_day", term.starts_on).lte("school_day", term.ends_on),
          db.from("subject_results").select("subject_id,total_percent,grade,grade_remark").eq("school_id", schoolId).eq("enrollment_id", enrollmentForTerm.id).eq("term_id", term.id),
          db.from("term_rankings").select("position,class_size,average_percent").eq("school_id", schoolId).eq("enrollment_id", enrollmentForTerm.id).eq("term_id", term.id).maybeSingle(),
        ]);
        const counts: Record<string, number> = {};
        for (const row of (a.data ?? []) as { status: string }[]) counts[row.status] = (counts[row.status] ?? 0) + 1;
        setAtt(counts); setResults((r.data ?? []) as Result[]); setRank((k.data as typeof rank) ?? null);
      })();
    }, 0);
    return () => window.clearTimeout(timer);
  }, [db, schoolId, enrollmentForTerm, term]);

  async function payOnline(b: Bal) {
    const amount = toPesewas(payAmount);
    const owedNow = b.total_pesewas - b.paid_pesewas;
    if (!amount || amount < 100) return setPayError("Enter an amount of at least GHS 1.00.");
    if (amount > owedNow) return setPayError(`The amount is more than the balance of ${ghs(owedNow)}.`);
    setPayBusy(true); setPayError("");
    try {
      const res = await fetch("/api/payments/paystack/initialize", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ schoolId, invoiceId: b.invoice_id, amountPesewas: amount, next: `/schools/${slug}/portal` }) });
      const body = (await res.json()) as { authorizationUrl?: string; error?: string };
      if (!res.ok || !body.authorizationUrl) { setPayError(body.error ?? "Could not start the payment."); setPayBusy(false); return; }
      window.location.assign(body.authorizationUrl);
    } catch { setPayError("Could not reach the server."); setPayBusy(false); }
  }

  if (!loaded) return <p className="text-sm text-slate-500">Loading…</p>;
  if (children.length === 0) return <Empty>No students are linked to your account yet. Please ask the school office to link your account.</Empty>;

  const child = children.find((c) => c.id === childId);
  const owed = bals.reduce((s, b) => s + (b.total_pesewas - b.paid_pesewas), 0);
  const marked = Object.values(att).reduce((s, n) => s + n, 0);

  return (
    <div className="space-y-6">
      <Notice error={error} {...(paymentStatus ? PAYMENT_BANNER[paymentStatus] : {})} />
      <div className={`${card} grid gap-3 md:grid-cols-3`}>
        <div><label className={label}>Student</label><select className={field} value={childId} onChange={(e) => setChildId(e.target.value)}>{children.map((c) => <option key={c.id} value={c.id}>{c.first_name} {c.last_name}</option>)}</select></div>
        <div><label className={label}>Term</label><select className={field} value={termId} onChange={(e) => setTermId(e.target.value)}>{terms.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}</select></div>
      </div>
      <Tabs<Tab> value={tab} onChange={setTab} tabs={[{ id: "overview", label: "Overview" }, { id: "fees", label: "Fees" }, { id: "results", label: "Results" }, { id: "notices", label: "Notices" }]} />

      {tab === "overview" && child && (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <div className={card}><p className="text-sm text-slate-500">Class</p><p className="mt-1 text-lg font-bold">{enrollmentForTerm ? classes[enrollmentForTerm.class_id] ?? "—" : "Not enrolled this year"}</p><p className="text-xs text-slate-500">Admission no. {child.admission_number}</p></div>
          <div className={card}><p className="text-sm text-slate-500">Attendance this term</p><p className="mt-1 text-lg font-bold">{marked ? `${Math.round((((att.present ?? 0) + (att.late ?? 0)) / marked) * 100)}% present` : "No records"}</p><p className="text-xs text-slate-500">Absent {att.absent ?? 0} · Late {att.late ?? 0}</p></div>
          <div className={card}><p className="text-sm text-slate-500">Fees balance</p><p className={`mt-1 text-lg font-bold ${owed > 0 ? "text-red-700" : "text-green-700"}`}>{owed > 0 ? ghs(owed) : "Fully paid"}</p></div>
          <div className={card}><p className="text-sm text-slate-500">Class position</p><p className="mt-1 text-lg font-bold">{rank ? `${rank.position} of ${rank.class_size}` : "—"}</p>{rank && <p className="text-xs text-slate-500">Average {rank.average_percent}%</p>}</div>
        </div>)}

      {tab === "fees" && (bals.length === 0 ? <Empty>No invoices yet.</Empty> : (
        <div className="space-y-4">
          <div className={`${card} overflow-x-auto p-0`}><table className="w-full"><thead className="border-b"><tr><th className={th}>Invoice</th><th className={th}>Issued</th><th className={`${th} text-right`}>Total</th><th className={`${th} text-right`}>Paid</th><th className={`${th} text-right`}>Balance</th><th /></tr></thead>
            <tbody>{bals.map((b) => { const bal = b.total_pesewas - b.paid_pesewas; return <Fragment key={b.invoice_id}><tr className="border-b last:border-0"><td className={td}>{b.invoice_number}{b.due_on && <div className="text-xs text-slate-500">Due {fmtDate(b.due_on)}</div>}</td><td className={td}>{fmtDate(b.issued_on)}</td><td className={`${td} text-right`}>{ghs(b.total_pesewas)}</td><td className={`${td} text-right`}>{ghs(b.paid_pesewas)}</td><td className={`${td} text-right font-semibold ${bal > 0 ? "text-red-700" : "text-green-700"}`}>{bal > 0 ? ghs(bal) : "Paid"}</td>
              <td className={`${td} text-right`}>{onlineEnabled && bal > 0 && <button className={btnLight} onClick={() => { setPayInvoice(payInvoice === b.invoice_id ? null : b.invoice_id); setPayAmount((bal / 100).toFixed(2)); setPayError(""); }}>Pay online</button>}</td></tr>
              {payInvoice === b.invoice_id && <tr className="border-b bg-slate-50"><td colSpan={6} className="p-4"><div className="flex flex-wrap items-end gap-3">
                <div><label className={label}>Amount (GHS)</label><input className={`${field} w-40`} inputMode="decimal" value={payAmount} onChange={(e) => setPayAmount(e.target.value)} /></div>
                <button className={btn} disabled={payBusy} onClick={() => payOnline(b)}>{payBusy ? "Opening…" : "Continue to secure payment"}</button>
                <p className="w-full text-xs text-slate-500">You will pay on Paystack with mobile money or card. The school never sees your card or wallet PIN.</p>
                {payError && <p role="alert" className="w-full text-sm text-red-700">{payError}</p>}</div></td></tr>}</Fragment>; })}</tbody></table></div>
          {pays.length > 0 && <div className={`${card} overflow-x-auto p-0`}><div className="border-b px-4 py-3 font-semibold">Payments received</div><table className="w-full"><tbody>{pays.map((p) => <tr key={p.id} className="border-b last:border-0"><td className={td}>{fmtDate(p.paid_on)}</td><td className={td}>{p.receipt_number}</td><td className={`${td} capitalize`}>{p.method.replace("_", " ")}</td><td className={`${td} text-right`}>{ghs(p.amount_pesewas)}</td></tr>)}</tbody></table></div>}
        </div>))}

      {tab === "results" && (results.length === 0 ? <Empty>No results published for this term yet.</Empty> : (
        <div className={`${card} overflow-x-auto p-0`}><table className="w-full"><thead className="border-b"><tr><th className={th}>Subject</th><th className={`${th} text-right`}>Total (%)</th><th className={th}>Grade</th><th className={th}>Remark</th></tr></thead>
          <tbody>{[...results].sort((a, b) => (subjects[a.subject_id] ?? "").localeCompare(subjects[b.subject_id] ?? "")).map((r) => <tr key={r.subject_id} className="border-b last:border-0"><td className={td}>{subjects[r.subject_id] ?? "Subject"}</td><td className={`${td} text-right`}>{r.total_percent}</td><td className={`${td} font-semibold`}>{r.grade ?? "—"}</td><td className={td}>{r.grade_remark}</td></tr>)}</tbody></table>
          {rank && <p className="border-t px-4 py-3 text-sm">Average <b>{rank.average_percent}%</b> · Position <b>{rank.position}</b> of {rank.class_size}</p>}</div>))}

      {tab === "notices" && (notices.length === 0 ? <Empty>No notices.</Empty> : notices.map((n) => (
        <article key={n.id} className={card}><h3 className="font-semibold">{n.title}</h3><p className="text-xs text-slate-500">{fmtDate(n.created_at)}</p><p className="mt-2 whitespace-pre-wrap text-sm text-slate-700">{n.body}</p></article>)))}
    </div>
  );
}
