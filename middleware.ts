import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { auth, authRequired } from "@/auth";

// Gate the app behind sign-in only when sign-in is both configured and
// required. Otherwise every request passes straight through, so a deployment
// without auth credentials keeps working in guest mode.

const PUBLIC = ["/signin", "/api/auth"];

const guard = auth((req) => {
  const { pathname } = req.nextUrl;
  if (req.auth || PUBLIC.some((p) => pathname.startsWith(p))) return;
  const url = new URL("/signin", req.nextUrl.origin);
  url.searchParams.set("callbackUrl", pathname);
  return NextResponse.redirect(url);
});

export default function middleware(req: NextRequest, ctx: unknown) {
  if (!authRequired) return NextResponse.next();
  return (guard as unknown as (r: NextRequest, c: unknown) => Response)(req, ctx);
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|icon.svg|manifest.webmanifest).*)"],
};
