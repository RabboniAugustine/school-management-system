/**
 * =====================================================
 * SCHOOL MANAGEMENT SYSTEM
 * =====================================================
 *
 * File: src/lib/supabase/server.ts
 *
 * Module: Database Infrastructure
 *
 * Description:
 * Creates a secure, server-side Supabase client
 * for Next.js Server Components, Server Actions,
 * and API Route Handlers.
 *
 * Features:
 * - Cookie-based authentication
 * - Server-side database access
 * - Session integration
 * - Environment variable validation
 *
 * Version: 1.0.0
 * =====================================================
 */

import { createServerClient } from "@supabase/ssr";

import { cookies } from "next/headers";

/**
 * Create a Supabase server client.
 *
 * IMPORTANT:
 * This function must only be called from
 * server-side code.
 */

export async function createClient() {

  // ---------------------------------------------
  // STEP 1: Load Supabase environment variables
  // ---------------------------------------------

  const supabaseUrl =
    process.env.NEXT_PUBLIC_SUPABASE_URL;

  const supabasePublishableKey =
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;


  // ---------------------------------------------
  // STEP 2: Validate configuration
  // ---------------------------------------------

  if (!supabaseUrl) {

    throw new Error(
      "Supabase URL is missing. Check NEXT_PUBLIC_SUPABASE_URL."
    );

  }

  if (!supabasePublishableKey) {

    throw new Error(
      "Supabase publishable key is missing. Check NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY."
    );

  }


  // ---------------------------------------------
  // STEP 3: Access Next.js cookies
  // ---------------------------------------------

  const cookieStore = await cookies();


  // ---------------------------------------------
  // STEP 4: Create authenticated Supabase client
  // ---------------------------------------------

  return createServerClient(
    supabaseUrl,
    supabasePublishableKey,
    {

      cookies: {

        /**
         * Read the cookies associated
         * with the current request.
         */

        getAll() {

          return cookieStore.getAll();

        },


        /**
         * Update authentication cookies
         * when the framework allows it.
         */

        setAll(cookiesToSet) {

          try {

            cookiesToSet.forEach(
              ({ name, value, options }) => {

                cookieStore.set(
                  name,
                  value,
                  options
                );

              }
            );

          } catch {

            /**
             * Server Components cannot modify
             * cookies directly.
             *
             * A Next.js authentication proxy
             * will handle session refreshing.
             *
             * That proxy will be implemented
             * in our next development step.
             */

          }

        },

      },

    }
  );

}