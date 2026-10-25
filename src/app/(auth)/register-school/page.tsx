"use client";

/**
 * =====================================================
 * SCHOOL MANAGEMENT SYSTEM
 * =====================================================
 *
 * CODE: 011
 *
 * FILE:
 * src/app/(auth)/register-school/page.tsx
 *
 * MODULE:
 * School Registration & Onboarding
 *
 * VERSION:
 * 1.0.0
 *
 * DESCRIPTION:
 *
 * Secure school registration interface.
 *
 * FEATURES:
 * - Authentication verification
 * - School name validation
 * - Automatic school slug generation
 * - Main branch registration
 * - Supabase RPC integration
 * - Duplicate school identifier detection
 * - Registration confirmation
 * - Responsive design
 *
 * DATABASE FUNCTION:
 * public.register_school()
 *
 * =====================================================
 */

import {
  useEffect,
  useMemo,
  useState,
  type FormEvent,
} from "react";

import Link from "next/link";

import { useRouter } from "next/navigation";

import { createClient } from "@/lib/supabase/client";

import type { User } from "@supabase/supabase-js";

// =====================================================
// TYPES
// =====================================================

type AuthenticationStatus =
  | "checking"
  | "authenticated"
  | "unauthenticated";

// =====================================================
// SCHOOL SLUG GENERATOR
// =====================================================

function generateSchoolSlug(name: string): string {
  return name
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80)
    .replace(/-+$/g, "");
}

// =====================================================
// MAIN COMPONENT
// =====================================================

export default function RegisterSchoolPage() {
  const router = useRouter();

  // ---------------------------------------------------
  // SUPABASE CLIENT
  // ---------------------------------------------------

  const supabase = useMemo(() => createClient(), []);

  // ---------------------------------------------------
  // AUTHENTICATION STATE
  // ---------------------------------------------------

  const [authStatus, setAuthStatus] =
    useState<AuthenticationStatus>("checking");

  const [currentUser, setCurrentUser] =
    useState<User | null>(null);

  // ---------------------------------------------------
  // FORM STATE
  // ---------------------------------------------------

  const [schoolName, setSchoolName] = useState("");

  const [schoolSlug, setSchoolSlug] = useState("");

  const [branchName, setBranchName] =
    useState("Main Campus");

  const [slugEdited, setSlugEdited] = useState(false);

  // ---------------------------------------------------
  // SUBMISSION STATE
  // ---------------------------------------------------

  const [loading, setLoading] = useState(false);

  const [errorMessage, setErrorMessage] = useState("");

  const [createdSchoolId, setCreatedSchoolId] =
    useState<string | null>(null);

  // After a successful registration, open the new school's dashboard automatically.
  useEffect(() => {
    if (!createdSchoolId) return;

    const timer = window.setTimeout(() => {
      router.push(`/schools/${encodeURIComponent(schoolSlug.trim().toLowerCase())}/dashboard`);
    }, 2500);

    return () => window.clearTimeout(timer);
  }, [createdSchoolId, router, schoolSlug]);


  // =====================================================
  // VERIFY AUTHENTICATION
  // =====================================================

  useEffect(() => {
    let active = true;

    async function verifyUser() {
      try {
        const { data, error } =
          await supabase.auth.getUser();

        if (!active) return;

        if (error || !data.user) {
          setCurrentUser(null);
          setAuthStatus("unauthenticated");
          return;
        }

        setCurrentUser(data.user);
        setAuthStatus("authenticated");
      } catch {
        if (!active) return;

        setCurrentUser(null);
        setAuthStatus("unauthenticated");
      }
    }

    void verifyUser();

    return () => {
      active = false;
    };
  }, [supabase]);

  // =====================================================
  // HANDLE SCHOOL NAME CHANGE
  // =====================================================

  function handleSchoolNameChange(value: string) {
    setSchoolName(value);

    // Automatically generate the slug until
    // the user edits the slug manually.

    if (!slugEdited) {
      setSchoolSlug(generateSchoolSlug(value));
    }
  }

  // =====================================================
  // VALIDATE REGISTRATION FORM
  // =====================================================

  function validateForm(): string | null {
    const name = schoolName.trim();

    const slug = schoolSlug.trim().toLowerCase();

    const branch = branchName.trim();

    if (name.length < 2 || name.length > 200) {
      return "School name must contain between 2 and 200 characters.";
    }

    if (slug.length < 3 || slug.length > 80) {
      return "School URL identifier must contain between 3 and 80 characters.";
    }

    const slugPattern =
      /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

    if (!slugPattern.test(slug)) {
      return "School URL identifier may contain only lowercase letters, numbers, and hyphens.";
    }

    if (branch.length < 2 || branch.length > 200) {
      return "Branch name must contain between 2 and 200 characters.";
    }

    return null;
  }

  // =====================================================
  // HANDLE SCHOOL REGISTRATION
  // =====================================================

  async function handleRegistration(
    event: FormEvent<HTMLFormElement>
  ) {
    event.preventDefault();

    if (loading || createdSchoolId) return;

    setErrorMessage("");

    // -------------------------------------------------
    // STEP 1: Validate user input
    // -------------------------------------------------

    const validationError = validateForm();

    if (validationError) {
      setErrorMessage(validationError);
      return;
    }

    setLoading(true);

    try {
      // -----------------------------------------------
      // STEP 2: Verify the current authenticated user
      // -----------------------------------------------

      const { data: authData, error: authError } =
        await supabase.auth.getUser();

      if (authError || !authData.user) {
        setAuthStatus("unauthenticated");
        setCurrentUser(null);

        setErrorMessage(
          "Your session has expired. Please sign in again."
        );

        return;
      }

      // -----------------------------------------------
      // STEP 3: Prepare registration information
      // -----------------------------------------------

      const registrationData = {
        p_school_name: schoolName.trim(),

        p_school_slug: schoolSlug.trim().toLowerCase(),

        p_branch_name: branchName.trim(),
      };

      // -----------------------------------------------
      // STEP 4: Call secure PostgreSQL function
      // -----------------------------------------------

      const { data, error } = await supabase.rpc(
        "register_school",
        registrationData
      );

      // -----------------------------------------------
      // STEP 5: Handle database errors
      // -----------------------------------------------

      if (error) {
        console.error("School registration failed:", error);

        const message = error.message.toLowerCase();

        if (
          error.code === "23505" ||
          message.includes("school url name is already taken")
        ) {
          setErrorMessage(
            "This school URL identifier is already registered. Please choose another."
          );

          return;
        }

        if (
          message.includes("verify your email or phone")
        ) {
          setErrorMessage(
            "Please verify your email or phone number before registering a school."
          );

          return;
        }

        if (
          message.includes("authentication is required")
        ) {
          setErrorMessage(
            "Authentication is required. Please sign in again."
          );

          return;
        }

        if (
          error.code === "PGRST202" ||
          error.code === "42883"
        ) {
          setErrorMessage(
            "The school registration service is unavailable. Verify that CODE 010 was applied to Supabase."
          );

          return;
        }

        setErrorMessage(
          "School registration could not be completed. Please try again."
        );

        return;
      }

      // -----------------------------------------------
      // STEP 6: Verify returned school ID
      // -----------------------------------------------

      if (typeof data !== "string" || !data) {
        setErrorMessage(
          "Registration returned an unexpected response. Please check your school records before trying again."
        );

        return;
      }

      // -----------------------------------------------
      // STEP 7: Registration successful
      // -----------------------------------------------

      setCreatedSchoolId(data);

    } catch (error) {
      console.error("Unexpected registration error:", error);

      setErrorMessage(
        "A connection error occurred. Please check your internet connection and try again."
      );
    } finally {
      setLoading(false);
    }
  }

  // =====================================================
  // LOADING AUTHENTICATION
  // =====================================================

  if (authStatus === "checking") {
    return (
      <main className="flex min-h-screen items-center justify-center bg-slate-50">

        <div
          role="status"
          className="rounded-2xl bg-white p-10 text-center shadow-sm"
        >
          <div className="mx-auto mb-5 h-10 w-10 animate-spin rounded-full border-4 border-blue-100 border-t-blue-700" />

          <p className="text-slate-600">
            Verifying your account...
          </p>
        </div>

      </main>
    );
  }

  // =====================================================
  // UNAUTHENTICATED USER
  // =====================================================

  if (authStatus === "unauthenticated") {
    return (
      <main className="flex min-h-screen items-center justify-center bg-slate-100 px-5">

        <div className="w-full max-w-md rounded-3xl bg-white p-8 text-center shadow-xl sm:p-10">

          <div className="mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-full bg-blue-100 text-3xl">
            🔒
          </div>

          <h1 className="text-2xl font-bold text-slate-900">
            Sign In Required
          </h1>

          <p className="mt-4 leading-7 text-slate-600">
            You must sign in with a verified account
            before registering a school.
          </p>

          {errorMessage && (
            <p
              role="alert"
              className="mt-4 text-sm text-red-600"
            >
              {errorMessage}
            </p>
          )}

          <Link
            href="/login"
            className="mt-8 block rounded-xl bg-blue-800 px-6 py-4 font-semibold text-white transition hover:bg-blue-900"
          >
            Go to Login
          </Link>

        </div>

      </main>
    );
  }

  // =====================================================
  // MAIN REGISTRATION INTERFACE
  // =====================================================

  return (
    <main className="min-h-screen bg-slate-50">

      {/* ============================================= */}
      {/* HEADER */}
      {/* ============================================= */}

      <header className="border-b border-slate-200 bg-white">

        <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-6 py-5">

          <div className="flex items-center gap-3">

            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-blue-900 text-white">

              <svg
                width="26"
                height="26"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <path d="m2 10 10-5 10 5-10 5z" />
                <path d="M6 12v5c3 2 9 2 12 0v-5" />
                <path d="M22 10v6" />
              </svg>

            </div>

            <div>
              <h1 className="font-bold text-slate-900">
                School Management
              </h1>

              <p className="text-xs text-slate-500">
                Smart Education Platform
              </p>
            </div>

          </div>

          <div className="hidden text-right sm:block">

            <p className="text-xs text-slate-500">
              Signed in as
            </p>

            <p className="max-w-56 truncate text-sm font-medium text-slate-800">
              {currentUser?.email ?? "Authenticated User"}
            </p>

          </div>

        </div>

      </header>

      {/* ============================================= */}
      {/* PAGE CONTENT */}
      {/* ============================================= */}

      <div className="mx-auto grid max-w-7xl gap-12 px-6 py-12 lg:grid-cols-2 lg:gap-20 lg:py-20">

        {/* =========================================== */}
        {/* LEFT INFORMATION PANEL */}
        {/* =========================================== */}

        <section className="lg:pt-12">

          <div className="mb-6 inline-flex rounded-full bg-blue-100 px-4 py-2 text-sm font-semibold text-blue-800">
            School Onboarding
          </div>

          <h2 className="max-w-xl text-4xl font-bold leading-tight tracking-tight text-slate-900 md:text-5xl">

            Bring Your School

            <span className="mt-2 block text-blue-800">
              Into the Digital Age.
            </span>

          </h2>

          <p className="mt-7 max-w-lg text-lg leading-8 text-slate-600">

            Register your school and prepare to manage
            academics, students, staff, attendance,
            school fees, and communication through
            one connected platform.

          </p>

          <div className="mt-10 space-y-6">

            {[
              {
                title: "One School, One Workspace",
                description:
                  "Each school receives its own dedicated management environment.",
              },
              {
                title: "Secure School Information",
                description:
                  "School memberships and permissions control access to records.",
              },
              {
                title: "Multi-Branch Support",
                description:
                  "Start with your main campus and add more branches later.",
              },
              {
                title: "Built for Ghanaian Schools",
                description:
                  "Default settings support Ghana cedis and the Africa/Accra timezone.",
              },
            ].map((feature, index) => (

              <div
                key={index}
                className="flex items-start gap-4"
              >

                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-green-100 font-bold text-green-700">
                  ✓
                </div>

                <div>
                  <h3 className="font-semibold text-slate-900">
                    {feature.title}
                  </h3>

                  <p className="mt-1 leading-7 text-slate-600">
                    {feature.description}
                  </p>
                </div>

              </div>

            ))}

          </div>

        </section>

        {/* =========================================== */}
        {/* RIGHT REGISTRATION PANEL */}
        {/* =========================================== */}

        <section>

          <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-xl shadow-slate-200/50 sm:p-10">

            {createdSchoolId ? (

              /* ===================================== */
              /* REGISTRATION SUCCESS */
              /* ===================================== */

              <div className="text-center">

                <div className="mx-auto mb-6 flex h-20 w-20 items-center justify-center rounded-full bg-green-100 text-4xl text-green-700">
                  ✓
                </div>

                <h2 className="text-3xl font-bold text-slate-900">
                  School Registered!
                </h2>

                <p className="mt-4 leading-7 text-slate-600">
                  Your school has been registered successfully.
                </p>

                <div className="mt-8 rounded-2xl bg-slate-50 p-6 text-left">

                  <p className="text-sm text-slate-500">
                    School Name
                  </p>

                  <p className="mt-1 font-semibold text-slate-900">
                    {schoolName.trim()}
                  </p>

                  <p className="mt-5 text-sm text-slate-500">
                    School Identifier
                  </p>

                  <p className="mt-1 break-all font-medium text-blue-800">
                    {schoolSlug.trim().toLowerCase()}
                  </p>

                  <p className="mt-5 text-sm text-slate-500">
                    School ID
                  </p>

                  <p className="mt-1 break-all font-mono text-xs text-slate-800">
                    {createdSchoolId}
                  </p>

                  <p className="mt-5 text-sm text-slate-500">
                    Main Branch
                  </p>

                  <p className="mt-1 font-medium text-slate-900">
                    {branchName.trim()}
                  </p>

                </div>

                <div className="mt-6 rounded-xl border border-blue-100 bg-blue-50 p-4 text-left">

                  <p className="text-sm leading-6 text-blue-900">
                    Your school and proprietor membership
                    have been created. Opening your dashboard
                    now...
                  </p>

                </div>

                <Link
                  href={`/schools/${encodeURIComponent(schoolSlug.trim().toLowerCase())}/dashboard`}
                  className="mt-8 block rounded-xl bg-blue-800 px-6 py-4 font-semibold text-white transition hover:bg-blue-900"
                >
                  Go to my dashboard
                </Link>

              </div>

            ) : (

              /* ===================================== */
              /* REGISTRATION FORM */
              /* ===================================== */

              <>

                <div className="mb-8">

                  <p className="text-sm font-semibold uppercase tracking-widest text-blue-700">
                    New School
                  </p>

                  <h2 className="mt-3 text-3xl font-bold text-slate-900">
                    Register Your School
                  </h2>

                  <p className="mt-3 leading-7 text-slate-500">
                    Complete the information below to
                    create your school&apos;s management account.
                  </p>

                </div>

                <form
                  onSubmit={handleRegistration}
                  className="space-y-6"
                >

                  {/* SCHOOL NAME */}

                  <div>

                    <label
                      htmlFor="schoolName"
                      className="mb-2 block text-sm font-semibold text-slate-700"
                    >
                      Official School Name
                    </label>

                    <input
                      id="schoolName"
                      name="schoolName"
                      type="text"
                      required
                      minLength={2}
                      maxLength={200}
                      value={schoolName}
                      onChange={(event) =>
                        handleSchoolNameChange(
                          event.target.value
                        )
                      }
                      disabled={loading}
                      placeholder="e.g. Excellence Academy"
                      className="w-full rounded-xl border border-slate-300 bg-white px-4 py-3.5 text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-blue-600 focus:ring-4 focus:ring-blue-100 disabled:opacity-60"
                    />

                  </div>

                  {/* SCHOOL SLUG */}

                  <div>

                    <label
                      htmlFor="schoolSlug"
                      className="mb-2 block text-sm font-semibold text-slate-700"
                    >
                      School URL Identifier
                    </label>

                    <input
                      id="schoolSlug"
                      name="schoolSlug"
                      type="text"
                      required
                      minLength={3}
                      maxLength={80}
                      value={schoolSlug}
                      onChange={(event) => {
                        setSchoolSlug(
                          event.target.value.toLowerCase()
                        );

                        setSlugEdited(true);
                      }}
                      disabled={loading}
                      placeholder="excellence-academy"
                      autoCapitalize="none"
                      spellCheck={false}
                      className="w-full rounded-xl border border-slate-300 bg-white px-4 py-3.5 text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-blue-600 focus:ring-4 focus:ring-blue-100 disabled:opacity-60"
                    />

                    <p className="mt-2 text-xs leading-5 text-slate-500">
                      Automatically generated from your
                      school name. You can customize it.
                    </p>

                    {schoolSlug && (

                      <div className="mt-3 rounded-lg bg-blue-50 px-3 py-2">

                        <p className="break-all text-xs text-blue-800">
                          Planned school URL: /schools/{schoolSlug}
                        </p>

                      </div>

                    )}

                  </div>

                  {/* MAIN BRANCH */}

                  <div>

                    <label
                      htmlFor="branchName"
                      className="mb-2 block text-sm font-semibold text-slate-700"
                    >
                      Main Campus / Branch
                    </label>

                    <input
                      id="branchName"
                      name="branchName"
                      type="text"
                      required
                      minLength={2}
                      maxLength={200}
                      value={branchName}
                      onChange={(event) =>
                        setBranchName(event.target.value)
                      }
                      disabled={loading}
                      placeholder="Main Campus"
                      className="w-full rounded-xl border border-slate-300 bg-white px-4 py-3.5 text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-blue-600 focus:ring-4 focus:ring-blue-100 disabled:opacity-60"
                    />

                    <p className="mt-2 text-xs leading-5 text-slate-500">
                      Additional branches can be created later.
                    </p>

                  </div>

                  {/* ERROR MESSAGE */}

                  {errorMessage && (

                    <div
                      role="alert"
                      className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm leading-6 text-red-700"
                    >
                      {errorMessage}
                    </div>

                  )}

                  {/* SUBMIT BUTTON */}

                  <button
                    type="submit"
                    disabled={loading}
                    className="flex w-full items-center justify-center rounded-xl bg-blue-800 px-6 py-4 font-semibold text-white shadow-lg shadow-blue-900/10 transition hover:bg-blue-900 focus:outline-none focus:ring-4 focus:ring-blue-200 disabled:cursor-not-allowed disabled:opacity-60"
                  >

                    {loading ? (

                      <span className="flex items-center gap-3">

                        <span className="h-5 w-5 animate-spin rounded-full border-2 border-white/30 border-t-white" />

                        Registering School...

                      </span>

                    ) : (

                      "Register School"

                    )}

                  </button>

                </form>

                <div className="mt-7 border-t border-slate-200 pt-6">

                  <p className="text-center text-sm leading-6 text-slate-500">
                    Registration requires a verified account.
                    Your school will be linked to your
                    authenticated user profile.
                  </p>

                </div>

              </>

            )}

          </div>

        </section>

      </div>

    </main>
  );
}