import { z } from "zod";
import type { StudentStatus } from "@prisma/client";
import { listStudents } from "@/lib/queries/students";
import { requireMobileRole, OFFICE } from "@/lib/mobile/session";
import { createStudentForActor } from "@/lib/mobile/mutations/students";
import { apiOk, apiError, withMobileRoute } from "@/lib/mobile/response";

const STATUSES: StudentStatus[] = ["ACTIVE", "ALUMNI", "TRANSFERRED", "DROPPED"];

/** Mirrors src/app/app/students/page.tsx's roster query. */
export const GET = withMobileRoute(async (req: Request) => {
  const actor = await requireMobileRole(req, ...OFFICE);
  const sp = new URL(req.url).searchParams;

  const statusParam = sp.get("status");
  const status = (STATUSES.find((s) => s === statusParam) ?? "ACTIVE") as StudentStatus;
  const apaarParam = sp.get("apaar");
  const duesParam = sp.get("dues");
  const pageParam = sp.get("page");

  const result = await listStudents(actor.schoolId, {
    q: sp.get("q")?.trim() || undefined,
    classId: sp.get("classId") || undefined,
    sectionId: sp.get("sectionId") || undefined,
    status,
    apaar: apaarParam === "issued" || apaarParam === "blocking" ? apaarParam : undefined,
    dues: duesParam === "overdue" || duesParam === "clear" ? duesParam : undefined,
    page: pageParam ? Number(pageParam) : 1,
  });

  return apiOk(result);
});

const Body = z.object({
  name: z.string().min(1),
  classId: z.string().min(1),
  sectionId: z.string().nullish(),
  admissionNumber: z.string().nullish(),
  rollNumber: z.number().int().nullish(),
  dobIso: z.string().nullish(),
  gender: z.string().nullish(),
  fatherName: z.string().nullish(),
  motherName: z.string().nullish(),
  guardianPhone: z.string().nullish(),
  guardianEmail: z.string().nullish(),
  address: z.string().nullish(),
  category: z.string().nullish(),
  bloodGroup: z.string().nullish(),
  admissionDateIso: z.string().nullish(),
});

/** Mirrors src/app/app/students/actions.ts::createStudent. */
export const POST = withMobileRoute(async (req: Request) => {
  const actor = await requireMobileRole(req, ...OFFICE);
  const input = Body.parse(await req.json());

  const result = await createStudentForActor(actor, input);
  if (!result.ok) return apiError(result.status, result.code, result.message);
  return apiOk(
    { studentId: result.studentId, admissionNumber: result.admissionNumber, messages: result.messages },
    201,
  );
});
