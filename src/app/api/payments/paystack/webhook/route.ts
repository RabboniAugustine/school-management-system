import { createAdminClient } from "@/lib/supabase/admin";
import { isValidSignature, paystackSecret } from "@/lib/paystack";

/**
 * Paystack webhook. Public by design, so authenticity comes only from the HMAC signature of the raw body.
 * Set this URL in the Paystack dashboard: https://<your-domain>/api/payments/paystack/webhook
 * apply_online_payment is idempotent, so Paystack's retries are safe.
 */
export async function POST(request: Request) {
  const secret = paystackSecret();
  if (!secret) return new Response("Not configured", { status: 503 });

  const raw = await request.text();
  if (!isValidSignature(raw, request.headers.get("x-paystack-signature"), secret)) return new Response("Invalid signature", { status: 401 });

  let event: { event?: string; data?: { reference?: string; amount?: number; currency?: string; channel?: string | null; id?: number; gateway_response?: string } };
  try { event = JSON.parse(raw); } catch { return new Response("Bad JSON", { status: 400 }); }
  const d = event.data;
  if (!d?.reference) return new Response("ok");

  const admin = createAdminClient();
  if (event.event === "charge.success") {
    if (d.currency !== "GHS" || !Number.isSafeInteger(d.amount)) {
      await admin.rpc("fail_online_payment", { p_reference: d.reference, p_reason: `Unexpected currency or amount (${d.currency})` });
      return new Response("ok");
    }
    const { error } = await admin.rpc("apply_online_payment", { p_reference: d.reference, p_amount_pesewas: d.amount as number, p_channel: d.channel ?? "card", p_provider_ref: String(d.id ?? d.reference) });
    // Unknown reference (P0002) is not our payment: acknowledge so Paystack stops retrying. Other errors: ask for a retry.
    if (error && error.code !== "P0002") return new Response("Retry", { status: 500 });
  } else if (event.event === "charge.failed") {
    await admin.rpc("fail_online_payment", { p_reference: d.reference, p_reason: d.gateway_response ?? "Payment failed" });
  }
  return new Response("ok");
}
