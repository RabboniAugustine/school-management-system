"use client";

import { useCallback, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { useRun } from "@/lib/useRun";
import { dbMessage, fmtDate } from "@/lib/format";
import { btn, btnLight, card, field, label, td, th } from "@/components/ui/styles";
import Notice from "@/components/ui/Notice";
import Empty from "@/components/ui/Empty";

type Student = { id: string; first_name: string; last_name: string; admission_number: string };
type Link = { link_id: string; student_id: string; email: string; relation: string; created_at: string };

export default function PortalAccessManager({ schoolId }: { schoolId: string }) {
  const db = useMemo(() => createClient(), []);
  const [students, setStudents] = useState<Student[]>([]);
  const [links, setLinks] = useState<Link[]>([]);
  const [form, setForm] = useState({ email: "", student_id: "", relation: "parent" });
  const [find, setFind] = useState("");
  const [error, setError] = useState("");
  const [ok, setOk] = useState("");
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const [s, l] = await Promise.all([
      db.from("students").select("id,first_name,last_name,admission_number").eq("school_id", schoolId).order("last_name").limit(2000),
      db.rpc("list_portal_links", { p_school_id: schoolId }),
    ]);
    if (s.error || l.error) return setError("Unable to load portal access.");
    setStudents((s.data ?? []) as Student[]); setLinks((l.data ?? []) as Link[]);
  }, [db, schoolId]);
  useRun(load);

  const name = (id: string) => { const s = students.find((x) => x.id === id); return s ? `${s.last_name}, ${s.first_name} (${s.admission_number})` : "Unknown"; };
  const needle = find.trim().toLowerCase();
  const options = students.filter((s) => !needle || `${s.first_name} ${s.last_name} ${s.admission_number}`.toLowerCase().includes(needle));

  async function link(e: React.FormEvent) {
    e.preventDefault();
    setError(""); setOk(""); setBusy(true);
    const { error: err } = await db.rpc("link_portal_user", { p_school_id: schoolId, p_email: form.email.trim(), p_student_id: form.student_id, p_relation: form.relation });
    setBusy(false);
    if (err) return setError(dbMessage(err, "Could not link that account."));
    setOk("Account linked. They can now open My family after signing in."); setForm({ ...form, email: "" }); await load();
  }

  async function unlink(id: string) {
    if (!confirm("Remove this person's access to the student?")) return;
    setError(""); setOk("");
    const { error: err } = await db.from("portal_links").delete().eq("school_id", schoolId).eq("id", id);
    if (err) return setError(dbMessage(err));
    setOk("Access removed."); await load();
  }

  return (
    <div className="space-y-6">
      <Notice error={error} ok={ok} />
      <form onSubmit={link} className={`${card} space-y-3`}>
        <p className="text-sm text-slate-600">The parent or student must first create an account with their email. Then link that email to the student here.</p>
        <div className="grid gap-3 md:grid-cols-4 md:items-end">
          <div><label className={label}>Account email</label><input type="email" required className={field} value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /></div>
          <div><label className={label}>Find student</label><input className={field} placeholder="Name or admission no." value={find} onChange={(e) => setFind(e.target.value)} /></div>
          <div><label className={label}>Student</label><select required className={field} value={form.student_id} onChange={(e) => setForm({ ...form, student_id: e.target.value })}><option value="">Choose…</option>{options.slice(0, 200).map((s) => <option key={s.id} value={s.id}>{s.last_name}, {s.first_name} ({s.admission_number})</option>)}</select></div>
          <div><label className={label}>Relationship</label><select className={field} value={form.relation} onChange={(e) => setForm({ ...form, relation: e.target.value })}><option value="parent">Parent / guardian</option><option value="student">The student</option></select></div>
        </div>
        <button className={btn} disabled={busy}>Link account</button>
      </form>
      {links.length === 0 ? <Empty>No portal accounts linked yet.</Empty> : (
        <div className={`${card} overflow-x-auto p-0`}><table className="w-full"><thead className="border-b"><tr><th className={th}>Account</th><th className={th}>Student</th><th className={th}>Relation</th><th className={th}>Linked</th><th /></tr></thead>
          <tbody>{links.map((l) => <tr key={l.link_id} className="border-b last:border-0"><td className={td}>{l.email}</td><td className={td}>{name(l.student_id)}</td><td className={`${td} capitalize`}>{l.relation}</td><td className={td}>{fmtDate(l.created_at)}</td><td className={`${td} text-right`}><button className={btnLight} onClick={() => unlink(l.link_id)}>Remove</button></td></tr>)}</tbody></table></div>)}
    </div>
  );
}
