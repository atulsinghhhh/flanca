import { z } from "zod";
import { getStudent } from "@/lib/queries/students";
import { requireMobileRole, OFFICE } from "@/lib/mobile/session";
import { updateStudentForActor } from "@/lib/mobile/mutations/students";
import { apiOk, apiError, withMobileRoute } from "@/lib/mobile/response";

type RouteCtx = { params: Promise<{ studentId: string }> };

/** Mirrors src/lib/queries/students.ts::getStudent, the same query the "my own profile" route uses. */
export const GET = withMobileRoute(async (req: Request, { params }: RouteCtx) => {
  const actor = await requireMobileRole(req, ...OFFICE);
  const { studentId } = await params;

  const data = await getStudent(actor.schoolId, studentId);
  if (!data) return apiError(404, "not_found", "That student is not on this school's roll.");
  return apiOk(data);
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

/** Mirrors src/app/app/students/actions.ts::updateStudent. */
export const PATCH = withMobileRoute(async (req: Request, { params }: RouteCtx) => {
  const actor = await requireMobileRole(req, ...OFFICE);
  const { studentId } = await params;
  const input = Body.parse(await req.json());

  const result = await updateStudentForActor(actor, { ...input, studentId });
  if (!result.ok) return apiError(result.status, result.code, result.message);
  return apiOk({ studentId: result.studentId, messages: result.messages });
});
