import crypto from "crypto";
import { describe, expect, it } from "vitest";
import { verifyRazorpaySignature } from "../payments-core";

function sign(orderId: string, paymentId: string, secret: string) {
  return crypto.createHmac("sha256", secret).update(`${orderId}|${paymentId}`).digest("hex");
}

describe("verifyRazorpaySignature — the check that stands in for a webhook", () => {
  const secret = "test_secret";
  const orderId = "order_abc123";
  const paymentId = "pay_xyz789";

  it("accepts a signature actually produced with the secret", () => {
    const signature = sign(orderId, paymentId, secret);
    expect(verifyRazorpaySignature({ orderId, paymentId, signature, secret })).toBe(true);
  });

  it("refuses a signature made with the wrong secret", () => {
    const signature = sign(orderId, paymentId, "wrong_secret");
    expect(verifyRazorpaySignature({ orderId, paymentId, signature, secret })).toBe(false);
  });

  it("refuses a signature for a different order", () => {
    const signature = sign("order_other", paymentId, secret);
    expect(verifyRazorpaySignature({ orderId, paymentId, signature, secret })).toBe(false);
  });

  it("refuses a signature for a different payment", () => {
    const signature = sign(orderId, "pay_other", secret);
    expect(verifyRazorpaySignature({ orderId, paymentId, signature, secret })).toBe(false);
  });

  it("refuses a garbage signature without throwing", () => {
    expect(verifyRazorpaySignature({ orderId, paymentId, signature: "not-hex-at-all", secret })).toBe(false);
  });

  it("refuses an empty signature", () => {
    expect(verifyRazorpaySignature({ orderId, paymentId, signature: "", secret })).toBe(false);
  });
});
