/**
 * DPDP consent vocabulary. Kept out of the "use server" action file because a
 * server-actions module may only export async functions.
 */

export const NOTICE_VERSION = "v1.0-2026";

/**
 * How a parent was actually verified. The Act requires VERIFIABLE parental
 * consent — a tick-box on an admission form does not qualify — so the method
 * is stored with every granted record and is what an auditor asks to see.
 */
export const VERIFICATION_METHODS = [
  { value: "OTP_PHONE", label: "OTP to registered mobile", strength: "Strong" },
  { value: "DIGILOCKER", label: "DigiLocker identity", strength: "Strongest" },
  { value: "IN_PERSON_ID", label: "In person, ID checked at the office", strength: "Strong" },
  { value: "SIGNED_FORM", label: "Signed paper form on file", strength: "Acceptable" },
] as const;

export type VerificationMethod = (typeof VERIFICATION_METHODS)[number]["value"];

export function isVerificationMethod(value: string | undefined): value is VerificationMethod {
  return VERIFICATION_METHODS.some((m) => m.value === value);
}

/** Never store a full mobile number as the verification reference. */
export function maskPhone(phone: string | null): string | null {
  if (!phone || phone.length < 4) return null;
  return `xxxxxx${phone.slice(-4)}`;
}

export function humanPurpose(purpose: string): string {
  return purpose.toLowerCase().replace(/_/g, " ");
}
