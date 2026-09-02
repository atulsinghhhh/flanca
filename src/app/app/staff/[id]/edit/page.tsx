import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { db } from "@/lib/db";
import { requireRole, OFFICE } from "@/lib/session";
import { PageHead } from "@/components/ui/primitives";
import { StaffForm } from "../../staff-form";

export const metadata = { title: "Edit staff — Flanca" };

export default async function EditStaffPage({ params }: { params: Promise<{ id: string }> }) {
  const actor = await requireRole(...OFFICE);
  const { id } = await params;

  const staff = await db.staff.findFirst({
    where: { id, schoolId: actor.schoolId },
    select: {
      id: true, employeeId: true, designation: true, department: true, qualification: true,
      basicPay: true, phone: true, address: true, joiningDate: true, dob: true, gender: true,
      panNumber: true, bankAccountNo: true, bankIfsc: true,
      userId: true, user: { select: { name: true, email: true, phone: true } },
    },
  });
  if (!staff) notFound();

  const roles = (
    await db.schoolRole.findMany({
      where: { userId: staff.userId, schoolId: actor.schoolId },
      select: { role: true },
    })
  ).map((r) => r.role as string);

  return (
    <>
      <Link
        href={`/app/staff/${staff.id}`}
        className="mb-3 inline-flex items-center gap-1.5 text-[13px] font-semibold text-ink-3 hover:text-ink"
      >
        <ArrowLeft className="size-3.5" /> {staff.user.name}
      </Link>
      <PageHead eyebrow="School" title={`Correct ${staff.user.name}'s record`} />
      <StaffForm
        existing={{
          staffId: staff.id,
          employeeId: staff.employeeId,
          name: staff.user.name,
          email: staff.user.email,
          phone: staff.phone ?? staff.user.phone ?? "",
          designation: staff.designation ?? "",
          department: staff.department ?? "",
          qualification: staff.qualification ?? "",
          roles,
          basicPayText: staff.basicPay ? String(staff.basicPay / 100) : "",
          joiningIso: staff.joiningDate?.toISOString().slice(0, 10) ?? "",
          dobIso: staff.dob?.toISOString().slice(0, 10) ?? "",
          gender: staff.gender ?? "",
          address: staff.address ?? "",
          panNumber: staff.panNumber ?? "",
          bankAccountNo: staff.bankAccountNo ?? "",
          bankIfsc: staff.bankIfsc ?? "",
        }}
      />
    </>
  );
}
