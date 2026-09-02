import crypto from "crypto";

/**
 * The one check that turns "Razorpay's checkout widget said it worked" into
 * something a server can actually trust: the widget hands the app back a
 * payment id and a signature, and only someone holding the account's secret
 * key could have produced that exact signature for that exact order+payment
 * pair. Verifying it here is what stands in for a webhook.
 */
export function verifyRazorpaySignature(params: {
  orderId: string;
  paymentId: string;
  signature: string;
  secret: string;
}): boolean {
  const expected = crypto
    .createHmac("sha256", params.secret)
    .update(`${params.orderId}|${params.paymentId}`)
    .digest("hex");

  const a = Buffer.from(expected);
  const b = Buffer.from(params.signature);
  // Different lengths would throw inside timingSafeEqual rather than just
  // returning false, and a length mismatch is itself not something worth
  // timing-attack protection over — it is already public information (HMAC-SHA256
  // hex digests are always 64 characters).
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}
