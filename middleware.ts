import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

/**
 * Protected routes that require authentication.
 * All routes under (root) are protected.
 */
const PROTECTED_ROUTES = [
  "/",
  "/my-banks",
  "/transaction-history",
  "/payment-transfer",
  "/profile",
];

/**
 * Public routes that should redirect to home if already authenticated.
 */
const AUTH_ROUTES = ["/sign-in", "/sign-up"];

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Skip auth in demo mode
  if (process.env.NEXT_PUBLIC_DEMO_MODE === "true") {
    return NextResponse.next();
  }

  const sessionCookie = request.cookies.get("appwrite-session");

  const isAuthenticated = !!sessionCookie?.value;

  // Redirect authenticated users away from auth pages
  if (isAuthenticated && AUTH_ROUTES.some((route) => pathname.startsWith(route))) {
    return NextResponse.redirect(new URL("/", request.url));
  }

  // Redirect unauthenticated users to sign-in
  if (!isAuthenticated && PROTECTED_ROUTES.some((route) => pathname === route || pathname.startsWith(route + "/"))) {
    const signInUrl = new URL("/sign-in", request.url);
    signInUrl.searchParams.set("redirect", pathname);
    return NextResponse.redirect(signInUrl);
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    /*
     * Match all request paths except:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     * - icons (public icons)
     * - api (API routes — handled separately)
     */
    "/((?!_next/static|_next/image|favicon.ico|icons|api).*)",
  ],
};
