import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";

const API = "https://api.paystack.co";

export function paystackSecret(): string | null {
  return process.env.PAYSTACK_SECRET_KEY || null;
}

/** Paystack signs the raw request body with HMAC-SHA512 using your secret key (header x-paystack-signature). */
export function isValidSignature(rawBody: string, signature: string | null, secret: string): boolean {
  if (!signature) return false;
  const expected = createHmac("sha512", secret).update(rawBody).digest("hex");
  const a = Buffer.from(expected, "utf8");
  const b = Buffer.from(signature.trim().toLowerCase(), "utf8");
  return a.length === b.length && timingSafeEqual(a, b);
}

export type PaystackTransaction = {
  id: number; reference: string; status: string; amount: number; currency: string; channel: string | null;
};

async function call<T>(path: string, init: RequestInit & { secret: string }): Promise<{ ok: true; data: T } | { ok: false; error: string }> {
  try {
    const res = await fetch(`${API}${path}`, {
      ...init,
      headers: { Authorization: `Bearer ${init.secret}`, "Content-Type": "application/json" },
      signal: AbortSignal.timeout(20_000),
    });
    const body = (await res.json().catch(() => ({}))) as { status?: boolean; message?: string; data?: T };
    if (res.ok && body.status && body.data) return { ok: true, data: body.data };
    return { ok: false, error: (body.message ?? `Paystack returned HTTP ${res.status}`).slice(0, 200) };
  } catch (e) {
    return { ok: false, error: (e instanceof Error ? e.message : "Network error").slice(0, 200) };
  }
}

export function initializeTransaction(secret: string, input: { email: string; amountPesewas: number; reference: string; subaccount: string | null; callbackUrl: string }) {
  return call<{ authorization_url: string; reference: string }>("/transaction/initialize", {
    secret, method: "POST",
    body: JSON.stringify({
      email: input.email, amount: input.amountPesewas, currency: "GHS", reference: input.reference,
      callback_url: input.callbackUrl, channels: ["mobile_money", "card"],
      ...(input.subaccount ? { subaccount: input.subaccount } : {}),
    }),
  });
}

export function verifyTransaction(secret: string, reference: string) {
  return call<PaystackTransaction>(`/transaction/verify/${encodeURIComponent(reference)}`, { secret, method: "GET" });
}
