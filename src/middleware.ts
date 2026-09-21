import { NextResponse, type NextRequest } from "next/server";

export const GUEST_COOKIE = "bink_guest";

/**
 * Gives every anonymous visitor a stable, private id before any page or
 * server action runs, so guest data can be scoped per-visitor without a
 * login. Server Components can't set cookies themselves, so this has to
 * happen here rather than lazily on first use.
 */
export function middleware(request: NextRequest) {
  if (request.cookies.get(GUEST_COOKIE)) return NextResponse.next();

  const response = NextResponse.next();
  response.cookies.set(GUEST_COOKIE, crypto.randomUUID(), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    maxAge: 60 * 60 * 24 * 180, // 180 days
    path: "/",
  });
  return response;
}

export const config = {
  matcher: "/((?!_next/static|_next/image|favicon.ico).*)",
};
