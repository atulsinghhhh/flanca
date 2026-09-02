import { NextResponse, type NextRequest } from "next/server";
import { isPreview } from "@/lib/preflight";

/**
 * The gate on a preview deployment.
 *
 * A preview has no database (see `isPreview`), so anything but the landing page
 * would meet Prisma and fail with a stack trace — which is a worse answer than
 * the truth. Everything that is not the front page is sent to /preview, which
 * says what this deployment is and where the real thing is.
 *
 * With FLANCA_PREVIEW unset this is a no-op: one `if`, and the request carries
 * on to a normal Flanca. That is deliberate — a gate that only exists in one
 * build is a gate nobody remembers when it starts refusing real traffic.
 */
const OPEN = new Set(["/", "/preview", "/suite", "/suite/index.html", "/api/health"]);

export function middleware(request: NextRequest) {
  if (!isPreview(process.env)) return NextResponse.next();

  const { pathname } = request.nextUrl;
  if (OPEN.has(pathname) || pathname.startsWith("/suite/")) return NextResponse.next();

  const url = request.nextUrl.clone();
  url.pathname = "/preview";
  url.search = "";
  return NextResponse.redirect(url);
}

/* Everything except Next's own assets and files with an extension (icons, the
 * manifest, the screenshots the landing page uses). */
export const config = {
  matcher: ["/((?!_next/|.*\\.[\\w]+$).*)"],
};
