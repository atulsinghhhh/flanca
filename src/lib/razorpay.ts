/**
 * Thin wrapper over Razorpay's REST API — deliberately not the `razorpay` npm
 * SDK. The whole surface this app needs is "create an order", which is one
 * authenticated POST; pulling in a dependency (and its own HTTP client, retry
 * logic, and type definitions) for that trades very little real convenience
 * for a bigger, less auditable supply chain.
 *
 * Auth is HTTP Basic with the key id as username and the key secret as
 * password — Razorpay's documented server-side auth scheme, not a workaround.
 */

const RAZORPAY_API_BASE = "https://api.razorpay.com/v1";

function credentials() {
  const keyId = process.env.RAZORPAY_KEY_ID;
  const keySecret = process.env.RAZORPAY_KEY_SECRET;
  if (!keyId || !keySecret) {
    throw new Error("Razorpay is not configured: set RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET.");
  }
  return { keyId, keySecret };
}

export type RazorpayOrder = {
  id: string;
  amount: number;
  currency: string;
  status: string;
};

/**
 * One order per payment attempt. `receipt` is Razorpay's own idempotency-ish
 * reference field (shows up in their dashboard) — we pass our PaymentOrder id
 * for it once that row exists, so a support ticket can be traced both ways.
 */
export async function createRazorpayOrder(params: {
  amountPaise: number;
  receipt: string;
  notes?: Record<string, string>;
}): Promise<RazorpayOrder> {
  const { keyId, keySecret } = credentials();

  const res = await fetch(`${RAZORPAY_API_BASE}/orders`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Basic ${Buffer.from(`${keyId}:${keySecret}`).toString("base64")}`,
    },
    body: JSON.stringify({
      amount: params.amountPaise,
      currency: "INR",
      receipt: params.receipt,
      notes: params.notes,
    }),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Razorpay order creation failed (${res.status}): ${body}`);
  }

  return (await res.json()) as RazorpayOrder;
}

export function razorpayKeyId(): string {
  return credentials().keyId;
}
