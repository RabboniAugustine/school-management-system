import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { initializeTransaction, paystackSecret } from "@/lib/paystack";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/** Only same-site paths are allowed as the post-payment destination (prevents open redirects). */
function safeNext(value: unknown): string {
  return typeof value === "string" && /^\/schools\/[A-Za-z0-9_-]+\/[A-Za-z0-9/_-]*$/.test(value) && !value.includes("//") ? value : "/";
}

/**
 * Starts a Paystack checkout for an invoice.
 * The database function start_online_payment decides whether the signed-in user may pay this invoice,
 * checks the amount against the balance and creates the pending record with a server-made reference.
 */
export async function POST(request: Request) {
  const secret = paystackSecret();
  if (!secret) return Response.json({ error: "Online payments are not configured on this server." }, { status: 503 });

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user?.email) return Response.json({ error: "Please sign in again." }, { status: 401 });

  const body = (await request.json().catch(() => null)) as { schoolId?: string; invoiceId?: string; amountPesewas?: number; next?: string } | null;
  if (!body?.schoolId || !UUID.test(body.schoolId) || !body.invoiceId || !UUID.test(body.invoiceId) || !Number.isSafeInteger(body.amountPesewas)) {
    return Response.json({ error: "Invalid request." }, { status: 400 });
  }

  const started = await supabase.rpc("start_online_payment", { p_school_id: body.schoolId, p_invoice_id: body.invoiceId, p_amount_pesewas: body.amountPesewas });
  if (started.error || !started.data?.[0]) {
    const code = started.error?.code;
    return Response.json({ error: code === "42501" ? "You cannot pay this invoice." : started.error?.message ?? "Could not start the payment." }, { status: code === "42501" ? 403 : 400 });
  }
  const { reference, amount_pesewas, subaccount_code } = started.data[0] as { reference: string; amount_pesewas: number; subaccount_code: string | null };

  const origin = process.env.NEXT_PUBLIC_SITE_URL ?? new URL(request.url).origin;
  const callbackUrl = `${origin}/api/payments/paystack/callback?next=${encodeURIComponent(safeNext(body.next))}`;
  const init = await initializeTransaction(secret, { email: user.email, amountPesewas: amount_pesewas, reference, subaccount: subaccount_code, callbackUrl });
  if (!init.ok) {
    await createAdminClient().rpc("fail_online_payment", { p_reference: reference, p_reason: `Initialize failed: ${init.error}` });
    return Response.json({ error: "The payment provider could not be reached. Please try again." }, { status: 502 });
  }
  return Response.json({ authorizationUrl: init.data.authorization_url, reference });
}
