import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { paystackSecret, verifyTransaction } from "@/lib/paystack";

function safeNext(value: string | null): string {
  return value && /^\/schools\/[A-Za-z0-9_-]+\/[A-Za-z0-9/_-]*$/.test(value) && !value.includes("//") ? value : "/";
}

/**
 * Where Paystack sends the customer after checkout. The browser's claim is never trusted: we ask Paystack
 * for the transaction and apply it ourselves. The webhook may do the same, which is safe (idempotent).
 */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const reference = url.searchParams.get("reference") ?? url.searchParams.get("trxref");
  const dest = new URL(safeNext(url.searchParams.get("next")), url.origin);
  const secret = paystackSecret();
  if (!reference || !secret) { dest.searchParams.set("payment", "error"); return NextResponse.redirect(dest); }

  const verified = await verifyTransaction(secret, reference);
  let outcome = "pending";
  if (verified.ok) {
    const t = verified.data;
    if (t.status === "success" && t.currency === "GHS") {
      const { data, error } = await createAdminClient().rpc("apply_online_payment", { p_reference: reference, p_amount_pesewas: t.amount, p_channel: t.channel ?? "card", p_provider_ref: String(t.id) });
      outcome = !error && data ? "success" : "review";
    } else if (t.status === "failed" || t.status === "abandoned") outcome = "failed";
  }
  dest.searchParams.set("payment", outcome);
  return NextResponse.redirect(dest);
}
