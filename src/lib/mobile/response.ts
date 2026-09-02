import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { MobileAuthError } from "@/lib/mobile/session";

export function apiOk<T>(data: T, status = 200) {
  return NextResponse.json({ data }, { status });
}

export function apiError(status: number, code: string, message: string) {
  return NextResponse.json({ error: { code, message } }, { status });
}

/**
 * Wraps a mobile route handler so every route file is just business logic —
 * auth failures and validation errors turn into the same {error} envelope
 * instead of an unhandled 500.
 */
export function withMobileRoute<Args extends unknown[]>(
  handler: (...args: Args) => Promise<Response>,
) {
  return async (...args: Args): Promise<Response> => {
    try {
      return await handler(...args);
    } catch (err) {
      if (err instanceof MobileAuthError) {
        return apiError(err.status, err.code, err.message);
      }
      if (err instanceof ZodError) {
        return apiError(422, "invalid_input", err.issues.map((i) => i.message).join("; "));
      }
      console.error("[mobile-api]", err);
      return apiError(500, "internal_error", "Something went wrong.");
    }
  };
}
