/**
 * =====================================================
 * SCHOOL MANAGEMENT SYSTEM
 * =====================================================
 *
 * File: src/lib/supabase/proxy.ts
 *
 * Module: Authentication Infrastructure
 *
 * Description:
 * Handles Supabase authentication session
 * refreshing and cookie synchronization.
 *
 * Version: 1.0.0
 * =====================================================
 */

import { createServerClient } from "@supabase/ssr";

import {
  NextResponse,
  type NextRequest,
} from "next/server";

/**
 * Update the authentication session.
 *
 * This function runs through the Next.js proxy.
 */

export async function updateSession(
  request: NextRequest
) {

  // -------------------------------------------
  // STEP 1: Initialize the response
  // -------------------------------------------

  let supabaseResponse = NextResponse.next({
    request,
  });

  // -------------------------------------------
  // STEP 2: Load environment variables
  // -------------------------------------------

  const supabaseUrl =
    process.env.NEXT_PUBLIC_SUPABASE_URL;

  const supabasePublishableKey =
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

  if (!supabaseUrl) {
    throw new Error(
      "Missing NEXT_PUBLIC_SUPABASE_URL"
    );
  }

  if (!supabasePublishableKey) {
    throw new Error(
      "Missing NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY"
    );
  }

  // -------------------------------------------
  // STEP 3: Create a request-specific client
  // -------------------------------------------

  const supabase = createServerClient(
    supabaseUrl,
    supabasePublishableKey,
    {
      cookies: {

        /**
         * Read authentication cookies
         * from the incoming request.
         */

        getAll() {
          return request.cookies.getAll();
        },

        /**
         * Update cookies when Supabase
         * refreshes the authentication session.
         */

        setAll(cookiesToSet, headers) {

          // Update the incoming request cookies.
          // This makes refreshed tokens available
          // to downstream Server Components.

          cookiesToSet.forEach(
            ({ name, value }) => {

              request.cookies.set(
                name,
                value
              );

            }
          );

          // Recreate the response using
          // the updated request cookies.

          supabaseResponse = NextResponse.next({
            request,
          });

          // Send updated cookies to the browser.

          cookiesToSet.forEach(
            ({ name, value, options }) => {

              supabaseResponse.cookies.set(
                name,
                value,
                options
              );

            }
          );

          // Apply cache-control headers supplied
          // by Supabase during session refresh.
          // This helps prevent caching of
          // authentication responses.

          Object.entries(headers).forEach(
            ([key, value]) => {

              supabaseResponse.headers.set(
                key,
                value
              );

            }
          );

        },

      },
    }
  );

  // -------------------------------------------
  // STEP 4: Verify or refresh the session
  // -------------------------------------------

  /**
   * IMPORTANT:
   *
   * Do not remove getClaims().
   *
   * Supabase uses this operation to verify
   * authentication claims and refresh
   * the session when necessary.
   */

  await supabase.auth.getClaims();

  // -------------------------------------------
  // STEP 5: Return the updated response
  // -------------------------------------------

  /**
   * Always return supabaseResponse.
   *
   * It contains any refreshed cookies
   * and associated response headers.
   */

  return supabaseResponse;

}