import { redirect } from "next/navigation";
import { Mark } from "@/components/shell/mark";

export const metadata = { title: "Verify a certificate — Flanca", robots: { index: false } };

async function go(formData: FormData) {
  "use server";
  const code = String(formData.get("code") ?? "").trim();
  redirect(`/verify/${encodeURIComponent(code)}`);
}

/** Where a receiving school types the code printed on a certificate. */
export default function EnterCodePage() {
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center bg-paper px-5 py-12">
      <div className="mb-7 flex items-center gap-2.5">
        <Mark size={26} />
        <span className="font-display text-[19px] font-semibold tracking-[-0.02em]">Flanca</span>
      </div>

      <div className="card w-full max-w-md p-7">
        <p className="eyebrow text-ink-3">Certificate check</p>
        <h1 className="mt-1 font-display text-[22px] font-semibold">Verify a certificate</h1>
        <p className="mt-2 text-[13.5px] leading-relaxed text-ink-2">
          Transfer, bonafide and character certificates issued through Flanca carry a verification
          code near the signature. Enter it to confirm the certificate is genuine and has not been
          withdrawn.
        </p>

        <form action={go} className="mt-5">
          <label htmlFor="code" className="mb-1.5 block text-[13px] font-semibold">
            Verification code
          </label>
          <input
            id="code"
            name="code"
            required
            autoFocus
            placeholder="Paste the code from the certificate"
            className="h-11 w-full rounded-md border border-line-2 bg-white px-3 font-mono text-[13px] outline-none focus:border-brand"
          />
          <button
            type="submit"
            className="mt-3 h-11 w-full rounded-md bg-brand text-[15px] font-semibold text-white hover:bg-brand-dark"
          >
            Check this certificate
          </button>
        </form>
      </div>
    </div>
  );
}
