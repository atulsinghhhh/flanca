"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { audit, requireRole, OFFICE } from "@/lib/session";

/** Edit the school's own details — what appears on every receipt and certificate. */
export async function updateSchool(_prev: unknown, formData: FormData) {
  const actor = await requireRole(...OFFICE);

  const name = String(formData.get("name") ?? "").trim();
  if (name.length < 3) return { error: "The school needs a name." };

  const upiId = String(formData.get("upiId") ?? "").trim();
  // A wrong UPI ID means a parent's money goes nowhere, so it is checked.
  if (upiId && !/^[\w.\-]{2,}@[a-zA-Z]{2,}$/.test(upiId)) {
    return { error: "That UPI ID does not look right. It should look like subhashacademy@sbi." };
  }

  const before = await db.school.findUnique({
    where: { id: actor.schoolId },
    select: { name: true, upiId: true, phone: true, email: true },
  });

  await db.school.update({
    where: { id: actor.schoolId },
    data: {
      name,
      address: String(formData.get("address") ?? "").trim() || null,
      city: String(formData.get("city") ?? "").trim() || null,
      state: String(formData.get("state") ?? "").trim() || null,
      phone: String(formData.get("phone") ?? "").trim() || null,
      email: String(formData.get("email") ?? "").trim() || null,
      principalName: String(formData.get("principalName") ?? "").trim() || null,
      udiseCode: String(formData.get("udiseCode") ?? "").trim() || null,
      affiliationNo: String(formData.get("affiliationNo") ?? "").trim() || null,
      upiId: upiId || null,
      upiPayeeName: String(formData.get("upiPayeeName") ?? "").trim() || null,
      bankName: String(formData.get("bankName") ?? "").trim() || null,
      bankAccountNo: String(formData.get("bankAccountNo") ?? "").trim() || null,
      bankIfsc: String(formData.get("bankIfsc") ?? "").trim().toUpperCase() || null,
    },
  });

  await audit({
    schoolId: actor.schoolId,
    actorId: actor.id,
    action: "school.update",
    entity: "School",
    entityId: actor.schoolId,
    summary: `School details updated${before?.name !== name ? ` — renamed from "${before?.name}"` : ""}`,
    before: before ?? undefined,
    after: { name, upiId },
  });

  revalidatePath("/app/settings");
  revalidatePath("/app");
  return { ok: true };
}
