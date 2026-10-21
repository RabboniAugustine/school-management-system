/**
 * =====================================================
 * SCHOOL MANAGEMENT SYSTEM
 * =====================================================
 *
 * File: src/proxy.ts
 *
 * Module: Authentication Infrastructure
 *
 * Description:
 * Next.js authentication proxy.
 *
 * Handles incoming requests and delegates
 * Supabase session management to updateSession.
 *
 * Version: 1.0.1
 * =====================================================
 */

import type { NextRequest } from "next/server";

import { updateSession } from "@/lib/supabase/proxy";

/**
 * Main Next.js Proxy Function
 *
 * Using a default export ensures Next.js
 * can recognize this function as the
 * application's request proxy.
 */

export default async function proxy(
  request: NextRequest
) {
  return await updateSession(request);
}

/**
 * Proxy Matcher Configuration
 *
 * Excludes static resources while allowing
 * authentication sessions to be refreshed
 * for application requests.
 */

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};