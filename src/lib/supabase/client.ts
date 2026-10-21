/**
 * SCHOOL MANAGEMENT SYSTEM
 *
 * File: src/lib/supabase/client.ts
 *
 * Description:
 * Creates the Supabase client used by
 * browser-side components.
 *
 * Version: 1.0.0
 */

import { createBrowserClient } from "@supabase/ssr";

/**
 * Supabase configuration
 */

const supabaseUrl =
  process.env.NEXT_PUBLIC_SUPABASE_URL;

const supabasePublishableKey =
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

/**
 * Validate environment variables
 */

if (!supabaseUrl) {
  throw new Error(
    "Missing NEXT_PUBLIC_SUPABASE_URL environment variable."
  );
}

if (!supabasePublishableKey) {
  throw new Error(
    "Missing NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY environment variable."
  );
}

/**
 * Create Supabase browser client
 *
 * This client will support:
 *
 * - User authentication
 * - Student data requests
 * - School information requests
 * - Teacher information requests
 * - Attendance management
 * - Real-time updates
 *
 * Database access will be controlled
 * through authentication and RLS.
 */

export function createClient() {
  return createBrowserClient(
    supabaseUrl!,
    supabasePublishableKey!
  );
}