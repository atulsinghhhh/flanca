import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { requireRole, OFFICE } from "@/lib/session";
import { PageHead } from "@/components/ui/primitives";
import { StaffForm } from "../staff-form";

export const metadata = { title: "Add staff — Flanca" };

export default async function NewStaffPage() {
  await requireRole(...OFFICE);
  return (
    <>
      <Link
        href="/app/staff"
        className="mb-3 inline-flex items-center gap-1.5 text-[13px] font-semibold text-ink-3 hover:text-ink"
      >
        <ArrowLeft className="size-3.5" /> Staff
      </Link>
      <PageHead
        eyebrow="School"
        title="Add a member of staff"
        sub="This creates their login as well. You will be shown a first password once, to pass on — it is stored only as a hash, so it cannot be read back afterwards."
      />
      <StaffForm />
    </>
  );
}
