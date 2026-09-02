import { redirect } from "next/navigation";

/** A single receipt is just the multi-receipt view with one id. */
export default async function SingleReceiptPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  redirect(`/app/fees/receipt?ids=${id}`);
}
