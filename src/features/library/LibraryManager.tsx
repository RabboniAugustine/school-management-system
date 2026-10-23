"use client";

import { useCallback, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { useRun } from "@/lib/useRun";
import { daysBetween, dbMessage, fmtDate, ghs, toPesewas, today } from "@/lib/format";
import { btn, btnLight, card, field, label, td, th } from "@/components/ui/styles";
import Tabs from "@/components/ui/Tabs";
import Notice from "@/components/ui/Notice";
import Empty from "@/components/ui/Empty";

type Book = { id: string; isbn: string | null; title: string; author: string | null; category: string | null; copies_total: number; is_active: boolean };
type Loan = { id: string; book_id: string; student_id: string | null; staff_id: string | null; loaned_on: string; due_on: string; returned_on: string | null; fine_pesewas: number };
type Person = { id: string; name: string };
type Tab = "loans" | "catalogue";
const FINE_PER_DAY_PESEWAS = 50;
const plusDays = (n: number) => { const d = new Date(); d.setDate(d.getDate() + n); return [d.getFullYear(), String(d.getMonth() + 1).padStart(2, "0"), String(d.getDate()).padStart(2, "0")].join("-"); };

export default function LibraryManager({ schoolId, canManage }: { schoolId: string; canManage: boolean }) {
  const db = useMemo(() => createClient(), []);
  const [tab, setTab] = useState<Tab>("loans");
  const [books, setBooks] = useState<Book[]>([]);
  const [loans, setLoans] = useState<Loan[]>([]);
  const [students, setStudents] = useState<Person[]>([]);
  const [staff, setStaff] = useState<Person[]>([]);
  const [error, setError] = useState("");
  const [ok, setOk] = useState("");
  const [busy, setBusy] = useState(false);
  const [q, setQ] = useState("");
  const [showReturned, setShowReturned] = useState(false);
  const [bf, setBf] = useState({ title: "", author: "", isbn: "", category: "", copies: "1" });
  const [lf, setLf] = useState({ book_id: "", kind: "student", person_id: "", due_on: plusDays(14) });
  const [returning, setReturning] = useState<{ loan: Loan; fine: string } | null>(null);

  const load = useCallback(async () => {
    const [b, l, s, st] = await Promise.all([
      db.from("library_books").select("*").eq("school_id", schoolId).order("title"),
      db.from("library_loans").select("id,book_id,student_id,staff_id,loaned_on,due_on,returned_on,fine_pesewas").eq("school_id", schoolId).order("loaned_on", { ascending: false }).limit(1000),
      db.from("students").select("id,first_name,last_name,admission_number").eq("school_id", schoolId).eq("status", "active").order("last_name").limit(2000),
      db.from("staff_members").select("id,first_name,last_name").eq("school_id", schoolId).order("last_name"),
    ]);
    if (b.error || l.error) return setError("Unable to load the library.");
    setBooks((b.data ?? []) as Book[]); setLoans((l.data ?? []) as Loan[]);
    setStudents(((s.data ?? []) as { id: string; first_name: string; last_name: string; admission_number: string }[]).map((x) => ({ id: x.id, name: `${x.last_name}, ${x.first_name} (${x.admission_number})` })));
    setStaff(((st.data ?? []) as { id: string; first_name: string; last_name: string }[]).map((x) => ({ id: x.id, name: `${x.last_name}, ${x.first_name}` })));
  }, [db, schoolId]);
  useRun(load);

  const out = useCallback((bookId: string) => loans.filter((l) => l.book_id === bookId && !l.returned_on).length, [loans]);
  const bookTitle = (id: string) => books.find((b) => b.id === id)?.title ?? "Unknown book";
  const borrower = (l: Loan) => (l.student_id ? students.find((s) => s.id === l.student_id)?.name : staff.find((s) => s.id === l.staff_id)?.name) ?? "Unknown";

  async function act(fn: () => PromiseLike<{ error: { message?: string; code?: string } | null }>, success: string) {
    setError(""); setOk(""); setBusy(true);
    const res = await fn();
    setBusy(false);
    if (res.error) { setError(res.error.code === "23514" ? (res.error.message ?? "Not allowed.") : dbMessage(res.error)); return false; }
    setOk(success); await load(); return true;
  }

  async function addBook(e: React.FormEvent) {
    e.preventDefault();
    const copies = Number(bf.copies);
    if (!Number.isInteger(copies) || copies < 1) return setError("Copies must be a whole number of at least 1.");
    if (await act(() => db.from("library_books").insert({ school_id: schoolId, title: bf.title.trim(), author: bf.author.trim() || null, isbn: bf.isbn.trim() || null, category: bf.category.trim() || null, copies_total: copies }), "Book added."))
      setBf({ title: "", author: "", isbn: "", category: "", copies: "1" });
  }

  async function lend(e: React.FormEvent) {
    e.preventDefault();
    if (!lf.book_id || !lf.person_id) return setError("Choose a book and a borrower.");
    if (await act(() => db.from("library_loans").insert({ school_id: schoolId, book_id: lf.book_id, student_id: lf.kind === "student" ? lf.person_id : null, staff_id: lf.kind === "staff" ? lf.person_id : null, loaned_on: today(), due_on: lf.due_on }), "Book lent."))
      setLf({ ...lf, book_id: "", person_id: "" });
  }

  function startReturn(l: Loan) {
    const late = Math.max(0, daysBetween(l.due_on, today()));
    setReturning({ loan: l, fine: late > 0 ? ((late * FINE_PER_DAY_PESEWAS) / 100).toFixed(2) : "0" });
  }

  async function confirmReturn() {
    if (!returning) return;
    const raw = returning.fine.trim();
    const fine = raw === "" || Number(raw) === 0 ? 0 : toPesewas(raw);
    if (fine === null) return setError("Enter a valid fine amount, or 0.");
    if (await act(() => db.from("library_loans").update({ returned_on: today(), fine_pesewas: fine }).eq("school_id", schoolId).eq("id", returning.loan.id), "Book returned.")) setReturning(null);
  }

  const needle = q.trim().toLowerCase();
  const shownBooks = books.filter((b) => !needle || [b.title, b.author, b.isbn, b.category].some((v) => v?.toLowerCase().includes(needle)));
  const openLoans = loans.filter((l) => !l.returned_on);
  const shownLoans = (showReturned ? loans : openLoans).filter((l) => !needle || bookTitle(l.book_id).toLowerCase().includes(needle) || borrower(l).toLowerCase().includes(needle));
  const lendable = books.filter((b) => b.is_active && out(b.id) < b.copies_total);
  const overdueCount = openLoans.filter((l) => l.due_on < today()).length;

  return (
    <div className="space-y-6">
      <Notice error={error} ok={ok} />
      <Tabs<Tab> value={tab} onChange={setTab} tabs={[{ id: "loans", label: `Loans (${openLoans.length} out${overdueCount ? `, ${overdueCount} overdue` : ""})` }, { id: "catalogue", label: `Catalogue (${books.length})` }]} />
      <input className={field} placeholder="Search books, authors, borrowers…" value={q} onChange={(e) => setQ(e.target.value)} />

      {tab === "catalogue" && (
        <section className="space-y-4">
          {canManage && <form onSubmit={addBook} className={`${card} grid gap-3 md:grid-cols-6 md:items-end`}>
            <div className="md:col-span-2"><label className={label}>Title</label><input className={field} required maxLength={200} value={bf.title} onChange={(e) => setBf({ ...bf, title: e.target.value })} /></div>
            <div><label className={label}>Author</label><input className={field} maxLength={160} value={bf.author} onChange={(e) => setBf({ ...bf, author: e.target.value })} /></div>
            <div><label className={label}>ISBN</label><input className={field} minLength={5} maxLength={20} value={bf.isbn} onChange={(e) => setBf({ ...bf, isbn: e.target.value })} /></div>
            <div><label className={label}>Category</label><input className={field} maxLength={80} value={bf.category} onChange={(e) => setBf({ ...bf, category: e.target.value })} /></div>
            <div><label className={label}>Copies</label><input className={field} inputMode="numeric" value={bf.copies} onChange={(e) => setBf({ ...bf, copies: e.target.value })} /></div>
            <div className="md:col-span-6"><button className={btn} disabled={busy}>Add book</button></div></form>}
          {shownBooks.length === 0 ? <Empty>No books found.</Empty> : <div className={`${card} overflow-x-auto p-0`}><table className="w-full"><thead className="border-b"><tr><th className={th}>Title</th><th className={th}>Author</th><th className={th}>Category</th><th className={`${th} text-right`}>Available</th><th /></tr></thead>
            <tbody>{shownBooks.map((b) => { const avail = b.copies_total - out(b.id); return <tr key={b.id} className="border-b last:border-0"><td className={td}>{b.title}{b.isbn && <div className="text-xs text-slate-500">ISBN {b.isbn}</div>}{!b.is_active && <div className="text-xs text-amber-700">Withdrawn</div>}</td><td className={td}>{b.author ?? "—"}</td><td className={td}>{b.category ?? "—"}</td>
              <td className={`${td} text-right ${avail === 0 ? "text-red-700" : ""}`}>{avail} / {b.copies_total}</td>
              <td className={`${td} text-right`}>{canManage && <button className={btnLight} disabled={busy} onClick={() => act(() => db.from("library_books").update({ is_active: !b.is_active }).eq("school_id", schoolId).eq("id", b.id), "Updated.")}>{b.is_active ? "Withdraw" : "Restore"}</button>}</td></tr>; })}</tbody></table></div>}
        </section>
      )}

      {tab === "loans" && (
        <section className="space-y-4">
          {canManage && <form onSubmit={lend} className={`${card} grid gap-3 md:grid-cols-5 md:items-end`}>
            <div className="md:col-span-2"><label className={label}>Book</label><select className={field} required value={lf.book_id} onChange={(e) => setLf({ ...lf, book_id: e.target.value })}><option value="">Choose…</option>{lendable.map((b) => <option key={b.id} value={b.id}>{b.title} ({b.copies_total - out(b.id)} available)</option>)}</select></div>
            <div><label className={label}>Borrower</label><select className={field} value={lf.kind} onChange={(e) => setLf({ ...lf, kind: e.target.value, person_id: "" })}><option value="student">Student</option><option value="staff">Staff</option></select></div>
            <div><label className={label}>&nbsp;</label><select className={field} required value={lf.person_id} onChange={(e) => setLf({ ...lf, person_id: e.target.value })}><option value="">Choose…</option>{(lf.kind === "student" ? students : staff).map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select></div>
            <div><label className={label}>Due</label><input type="date" className={field} required min={today()} value={lf.due_on} onChange={(e) => setLf({ ...lf, due_on: e.target.value })} /></div>
            <div className="md:col-span-5"><button className={btn} disabled={busy}>Lend book</button></div></form>}
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={showReturned} onChange={(e) => setShowReturned(e.target.checked)} /> Include returned loans</label>
          {returning && <div className={`${card} space-y-3 border-amber-300`}><p className="text-sm">Return <b>{bookTitle(returning.loan.book_id)}</b> from <b>{borrower(returning.loan)}</b>.{returning.loan.due_on < today() && ` ${daysBetween(returning.loan.due_on, today())} day(s) overdue.`}</p>
            <div className="grid max-w-xs gap-1"><label className={label}>Fine (GHS, 0 for none)</label><input className={field} inputMode="decimal" value={returning.fine} onChange={(e) => setReturning({ ...returning, fine: e.target.value })} /></div>
            <div className="flex gap-2"><button className={btn} disabled={busy} onClick={confirmReturn}>Confirm return</button><button className={btnLight} onClick={() => setReturning(null)}>Cancel</button></div></div>}
          {shownLoans.length === 0 ? <Empty>No loans to show.</Empty> : <div className={`${card} overflow-x-auto p-0`}><table className="w-full"><thead className="border-b"><tr><th className={th}>Book</th><th className={th}>Borrower</th><th className={th}>Lent</th><th className={th}>Due</th><th className={th}>Status</th><th /></tr></thead>
            <tbody>{shownLoans.map((l) => { const late = !l.returned_on && l.due_on < today(); return <tr key={l.id} className="border-b last:border-0"><td className={td}>{bookTitle(l.book_id)}</td><td className={td}>{borrower(l)}</td><td className={td}>{fmtDate(l.loaned_on)}</td><td className={td}>{fmtDate(l.due_on)}</td>
              <td className={td}>{l.returned_on ? <>Returned {fmtDate(l.returned_on)}{l.fine_pesewas > 0 && <div className="text-xs text-amber-700">Fine {ghs(l.fine_pesewas)}</div>}</> : late ? <span className="font-semibold text-red-700">{daysBetween(l.due_on, today())} days overdue</span> : "On loan"}</td>
              <td className={`${td} text-right`}>{canManage && !l.returned_on && <button className={btnLight} onClick={() => startReturn(l)}>Return</button>}</td></tr>; })}</tbody></table></div>}
        </section>
      )}
    </div>
  );
}
