"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { dbMessage, fmtDate, today } from "@/lib/format";
import { btn, btnLight, card, field, label, td, th } from "@/components/ui/styles";
import Tabs from "@/components/ui/Tabs";
import Notice from "@/components/ui/Notice";
import Empty from "@/components/ui/Empty";

type Announcement = { id: string; title: string; body: string; audience: string; is_published: boolean; created_at: string };
type Sms = { id: string; recipient_name: string | null; recipient_phone: string; body: string; kind: string; status: string; error: string | null; created_at: string };
type Tab = "announcements" | "sms";
const AUDIENCES = [["all", "Everyone"], ["staff", "Staff"], ["parents", "Parents"], ["students", "Students"]] as const;
const STATUS_STYLE: Record<string, string> = { queued: "bg-amber-100 text-amber-800", sent: "bg-green-100 text-green-800", failed: "bg-red-100 text-red-800", simulated: "bg-slate-100 text-slate-700" };

export default function CommunicationManager({ schoolId, canManage }: { schoolId: string; canManage: boolean }) {
  const db = useMemo(() => createClient(), []);
  const [tab, setTab] = useState<Tab>("announcements");
  const [items, setItems] = useState<Announcement[]>([]);
  const [outbox, setOutbox] = useState<Sms[]>([]);
  const [error, setError] = useState("");
  const [ok, setOk] = useState("");
  const [busy, setBusy] = useState(false);
  const [af, setAf] = useState({ title: "", body: "", audience: "all" });
  const [day, setDay] = useState(today());
  const [custom, setCustom] = useState({ name: "", phone: "", body: "" });

  const load = useCallback(async () => {
    const [a, s] = await Promise.all([
      db.from("announcements").select("id,title,body,audience,is_published,created_at").eq("school_id", schoolId).order("created_at", { ascending: false }).limit(100),
      db.from("sms_outbox").select("id,recipient_name,recipient_phone,body,kind,status,error,created_at").eq("school_id", schoolId).order("created_at", { ascending: false }).limit(200),
    ]);
    if (a.error || s.error) return setError("Unable to load messages.");
    setItems((a.data ?? []) as Announcement[]); setOutbox((s.data ?? []) as Sms[]);
  }, [db, schoolId]);
  useEffect(() => { void load(); }, [load]);

  async function act(fn: () => PromiseLike<{ error: { message?: string; code?: string } | null; data?: unknown }>, success: (data: unknown) => string) {
    setError(""); setOk(""); setBusy(true);
    const res = await fn();
    setBusy(false);
    if (res.error) return setError(dbMessage(res.error));
    setOk(success(res.data)); await load();
  }

  async function publish(e: React.FormEvent) {
    e.preventDefault();
    await act(() => db.from("announcements").insert({ school_id: schoolId, title: af.title.trim(), body: af.body.trim(), audience: af.audience, is_published: true }), () => "Announcement published.");
    setAf({ title: "", body: "", audience: "all" });
  }

  async function sendQueued() {
    setError(""); setOk(""); setBusy(true);
    try {
      const res = await fetch("/api/sms/dispatch", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ schoolId }) });
      const body = (await res.json()) as { error?: string; message?: string; sent?: number; failed?: number; simulated?: number; live?: boolean };
      if (!res.ok) setError(body.error ?? "Sending failed.");
      else setOk(body.message ?? `Sent ${body.sent}, failed ${body.failed}${body.live ? "" : `, simulated ${body.simulated} (no SMS provider key is configured, so nothing was really sent)`}.`);
    } catch { setError("Could not reach the server."); }
    setBusy(false); await load();
  }

  const counts = outbox.reduce<Record<string, number>>((m, r) => { m[r.status] = (m[r.status] ?? 0) + 1; return m; }, {});

  return (
    <div className="space-y-6">
      <Notice error={error} ok={ok} />
      <Tabs<Tab> value={tab} onChange={setTab} tabs={[{ id: "announcements", label: "Announcements" }, { id: "sms", label: `SMS (${counts.queued ?? 0} queued)` }]} />

      {tab === "announcements" && (
        <section className="space-y-4">
          {canManage && (
            <form onSubmit={publish} className={`${card} space-y-3`}>
              <div className="grid gap-3 md:grid-cols-3"><div className="md:col-span-2"><label className={label}>Title</label><input className={field} required minLength={3} maxLength={160} value={af.title} onChange={(e) => setAf({ ...af, title: e.target.value })} /></div>
                <div><label className={label}>Audience</label><select className={field} value={af.audience} onChange={(e) => setAf({ ...af, audience: e.target.value })}>{AUDIENCES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></div></div>
              <div><label className={label}>Message</label><textarea className={field} required minLength={3} maxLength={4000} rows={4} value={af.body} onChange={(e) => setAf({ ...af, body: e.target.value })} /></div>
              <button className={btn} disabled={busy}>Publish</button>
            </form>)}
          {items.length === 0 ? <Empty>No announcements yet.</Empty> : items.map((a) => (
            <article key={a.id} className={card}>
              <div className="flex flex-wrap items-start justify-between gap-2"><div><h3 className="font-semibold">{a.title}</h3>
                <p className="text-xs text-slate-500">{fmtDate(a.created_at)} · {AUDIENCES.find(([v]) => v === a.audience)?.[1]}{a.is_published ? "" : " · hidden"}</p></div>
                {canManage && <div className="flex gap-2">
                  <button className={btnLight} disabled={busy} onClick={() => act(() => db.from("announcements").update({ is_published: !a.is_published }).eq("school_id", schoolId).eq("id", a.id), () => "Updated.")}>{a.is_published ? "Hide" : "Show"}</button>
                  <button className={btnLight} disabled={busy} onClick={() => { if (confirm("Delete this announcement?")) void act(() => db.from("announcements").delete().eq("school_id", schoolId).eq("id", a.id), () => "Deleted."); }}>Delete</button></div>}</div>
              <p className="mt-3 whitespace-pre-wrap text-sm text-slate-700">{a.body}</p>
            </article>))}
        </section>
      )}

      {tab === "sms" && (
        <section className="space-y-4">
          {canManage && (
            <div className={`${card} space-y-4`}>
              <div className="grid gap-3 md:grid-cols-3 md:items-end">
                <div><label className={label}>Absence alerts for</label><input type="date" className={field} value={day} max={today()} onChange={(e) => setDay(e.target.value)} /></div>
                <div><button className={btn} disabled={busy} onClick={() => act(() => db.rpc("queue_absence_alerts", { p_school_id: schoolId, p_day: day }), (n) => `${n} absence alert(s) queued for primary guardians.`)}>Queue absence alerts</button></div>
                <div><button className={btn} disabled={busy} onClick={() => act(() => db.rpc("queue_fee_reminders", { p_school_id: schoolId }), (n) => `${n} fee reminder(s) queued.`)}>Queue fee reminders</button></div>
              </div>
              <form className="grid gap-3 md:grid-cols-6 md:items-end" onSubmit={(e) => { e.preventDefault(); void act(() => db.from("sms_outbox").insert({ school_id: schoolId, recipient_name: custom.name.trim() || null, recipient_phone: custom.phone.trim(), body: custom.body.trim(), kind: "custom" }), () => "Message queued."); setCustom({ name: "", phone: "", body: "" }); }}>
                <div><label className={label}>Recipient</label><input className={field} value={custom.name} onChange={(e) => setCustom({ ...custom, name: e.target.value })} /></div>
                <div><label className={label}>Phone</label><input className={field} required inputMode="tel" placeholder="024 123 4567" value={custom.phone} onChange={(e) => setCustom({ ...custom, phone: e.target.value })} /></div>
                <div className="md:col-span-3"><label className={label}>Message (max 480)</label><input className={field} required maxLength={480} value={custom.body} onChange={(e) => setCustom({ ...custom, body: e.target.value })} /></div>
                <button className={btnLight} disabled={busy}>Queue</button></form>
              <div className="flex flex-wrap gap-2 border-t pt-4">
                <button className={btn} disabled={busy || !(counts.queued ?? 0)} onClick={sendQueued}>Send {counts.queued ?? 0} queued message(s)</button>
                <button className={btnLight} disabled={busy || !(counts.failed ?? 0)} onClick={() => act(() => db.from("sms_outbox").update({ status: "queued", error: null }).eq("school_id", schoolId).eq("status", "failed"), () => "Failed messages re-queued.")}>Retry failed ({counts.failed ?? 0})</button>
              </div>
            </div>)}
          {outbox.length === 0 ? <Empty>The SMS outbox is empty.</Empty> : (
            <div className={`${card} overflow-x-auto p-0`}><table className="w-full"><thead className="border-b"><tr><th className={th}>When</th><th className={th}>To</th><th className={th}>Message</th><th className={th}>Status</th></tr></thead>
              <tbody>{outbox.map((m) => <tr key={m.id} className="border-b last:border-0 align-top"><td className={td}>{fmtDate(m.created_at)}</td><td className={td}>{m.recipient_name ?? "—"}<div className="text-xs text-slate-500">{m.recipient_phone}</div></td><td className={`${td} max-w-md`}>{m.body}</td>
                <td className={td}><span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${STATUS_STYLE[m.status] ?? ""}`}>{m.status}</span>{m.error && <div className="mt-1 text-xs text-red-700">{m.error}</div>}</td></tr>)}</tbody></table></div>)}
        </section>
      )}
    </div>
  );
}
