import { z } from "zod";
import { getLibraryCatalogue } from "@/lib/queries/library";
import { requireMobileRole } from "@/lib/mobile/session";
import { LIBRARY_ROLES, addBookForActor } from "@/lib/mobile/mutations/library";
import { apiOk, apiError, withMobileRoute } from "@/lib/mobile/response";

/** Catalogue search/list. Mirrors src/app/app/library/page.tsx's book list. */
export const GET = withMobileRoute(async (req: Request) => {
  const actor = await requireMobileRole(req, ...LIBRARY_ROLES);
  const q = new URL(req.url).searchParams.get("q") ?? undefined;

  const books = await getLibraryCatalogue(actor.schoolId, q);
  return apiOk({ books });
});

const Body = z.object({
  title: z.string().min(1),
  author: z.string().optional().nullable(),
  isbn: z.string().optional().nullable(),
  category: z.string().optional().nullable(),
  publisher: z.string().optional().nullable(),
  copies: z.number().int().min(1),
  shelf: z.string().optional().nullable(),
  price: z.number().optional().nullable(),
});

/** Mirrors src/app/app/library/actions.ts::addBook. */
export const POST = withMobileRoute(async (req: Request) => {
  const actor = await requireMobileRole(req, ...LIBRARY_ROLES);
  const input = Body.parse(await req.json());

  const result = await addBookForActor(actor, input);
  if (!result.ok) return apiError(result.status, result.code, result.message);
  return apiOk({ bookId: result.bookId, accessionNo: result.accessionNo }, 201);
});
