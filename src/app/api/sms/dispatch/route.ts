import { createClient } from "@/lib/supabase/server";

/**
 * Sends queued rows of public.sms_outbox for one school.
 *
 * Security: runs as the signed-in user, so row-level security decides everything. Messages are first
 * "claimed" with an UPDATE (which needs communication.manage) and only the rows the database let us claim
 * are sent, so a user without permission can never trigger a send, and two clicks cannot double-send.
 *
 * Provider: Arkesel (https://developers.arkesel.com). Set ARKESEL_API_KEY and optionally SMS_SENDER_ID.
 * Without a key, messages are marked "simulated" so the whole flow can be tried safely.
 */
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const BATCH = 50;

function normalisePhone(raw: string): string | null {
  const digits = raw.replace(/\D/g, "");
  if (digits.startsWith("233") && digits.length === 12) return digits;
  if (digits.startsWith("0") && digits.length === 10) return `233${digits.slice(1)}`;
  if (digits.length === 9) return `233${digits}`;
  return null;
}

async function sendViaArkesel(to: string, message: string): Promise<{ ok: boolean; ref?: string; error?: string }> {
  try {
    const res = await fetch("https://sms.arkesel.com/api/v2/sms/send", {
      method: "POST",
      headers: { "api-key": process.env.ARKESEL_API_KEY!, "Content-Type": "application/json" },
      body: JSON.stringify({ sender: (process.env.SMS_SENDER_ID ?? "School").slice(0, 11), message, recipients: [to] }),
      signal: AbortSignal.timeout(15_000),
    });
    const body = (await res.json().catch(() => ({}))) as { status?: string; message?: string; data?: { id?: string }[] };
    if (res.ok && body.status === "success") return { ok: true, ref: body.data?.[0]?.id };
    return { ok: false, error: (body.message ?? `Provider returned HTTP ${res.status}`).slice(0, 300) };
  } catch (e) {
    return { ok: false, error: (e instanceof Error ? e.message : "Network error").slice(0, 300) };
  }
}

export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return Response.json({ error: "Not signed in." }, { status: 401 });

  const body = (await request.json().catch(() => null)) as { schoolId?: string } | null;
  if (!body?.schoolId || !UUID.test(body.schoolId)) return Response.json({ error: "A valid schoolId is required." }, { status: 400 });

  const queued = await supabase.from("sms_outbox").select("id").eq("school_id", body.schoolId).eq("status", "queued").order("created_at").limit(BATCH);
  if (queued.error) return Response.json({ error: "Could not read the outbox." }, { status: 403 });
  const ids = (queued.data ?? []).map((r: { id: string }) => r.id);
  if (ids.length === 0) return Response.json({ sent: 0, failed: 0, simulated: 0, message: "Nothing queued." });

  const claimed = await supabase.from("sms_outbox")
    .update({ status: "failed", error: "Sending in progress" })
    .eq("school_id", body.schoolId).eq("status", "queued").in("id", ids)
    .select("id,recipient_phone,body");
  if (claimed.error) return Response.json({ error: "Could not start sending." }, { status: 403 });
  const rows = (claimed.data ?? []) as { id: string; recipient_phone: string; body: string }[];
  if (rows.length === 0) return Response.json({ error: "You are not allowed to send messages." }, { status: 403 });

  const live = Boolean(process.env.ARKESEL_API_KEY);
  const tally = { sent: 0, failed: 0, simulated: 0 };
  for (const row of rows) {
    const phone = normalisePhone(row.recipient_phone);
    let patch: { status: string; provider_ref?: string | null; error?: string | null; sent_at?: string | null };
    if (!phone) { patch = { status: "failed", error: "Invalid phone number" }; tally.failed++; }
    else if (!live) { patch = { status: "simulated", error: null, sent_at: new Date().toISOString() }; tally.simulated++; }
    else {
      const r = await sendViaArkesel(phone, row.body);
      if (r.ok) { patch = { status: "sent", provider_ref: r.ref ?? null, error: null, sent_at: new Date().toISOString() }; tally.sent++; }
      else { patch = { status: "failed", error: r.error ?? "Send failed" }; tally.failed++; }
    }
    await supabase.from("sms_outbox").update(patch).eq("school_id", body.schoolId).eq("id", row.id);
  }
  return Response.json({ ...tally, live });
}
