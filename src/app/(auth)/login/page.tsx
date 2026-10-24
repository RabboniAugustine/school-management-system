"use client";

/**
 * =====================================================
 * SCHOOL MANAGEMENT SYSTEM
 * =====================================================
 *
 * CODE: 008
 * FILE: src/app/(auth)/login/page.tsx
 *
 * MODULE: Authentication
 * VERSION: 1.0.0
 *
 * DESCRIPTION:
 *
 * Professional login interface for the
 * multi-tenant School Management System.
 *
 * FEATURES:
 * - Email and password authentication
 * - Supabase Auth integration
 * - Password visibility toggle
 * - Form validation
 * - Loading indicators
 * - Authentication error handling
 * - Existing session detection
 * - Secure logout
 * - Responsive interface
 *
 * =====================================================
 */

import {
  useEffect,
  useMemo,
  useState,
  type FormEvent,
} from "react";

import { createClient } from "@/lib/supabase/client";
import { clearOfflineCaches } from "@/components/offline/OfflineStatus";

/**
 * Main Login Component
 */

export default function LoginPage() {
  // =====================================================
  // SUPABASE CLIENT
  // =====================================================

  const supabase = useMemo(() => createClient(), []);

  // =====================================================
  // FORM STATES
  // =====================================================

  // Read the current year after hydration: Cache Components forbids new Date() during prerender.
  const [year, setYear] = useState<number | null>(null);
  useEffect(() => {
    const timer = window.setTimeout(() => setYear(new Date().getFullYear()), 0);
    return () => window.clearTimeout(timer);
  }, []);

  const [email, setEmail] = useState("");

  const [password, setPassword] = useState("");

  const [showPassword, setShowPassword] = useState(false);

  const [loading, setLoading] = useState(false);

  const [checkingSession, setCheckingSession] = useState(true);

  const [authenticatedEmail, setAuthenticatedEmail] =
    useState<string | null>(null);

  const [errorMessage, setErrorMessage] = useState("");

  // =====================================================
  // CHECK EXISTING AUTHENTICATION SESSION
  // =====================================================

  useEffect(() => {
    let active = true;

    async function checkSession() {
      try {
        const { data, error } = await supabase.auth.getUser();

        if (!active) return;

        if (!error && data.user) {
          setAuthenticatedEmail(
            data.user.email ?? "Authenticated user"
          );
        }
      } catch {
        // A failed session check does not prevent
        // the user from attempting to sign in.
      } finally {
        if (active) {
          setCheckingSession(false);
        }
      }
    }

    void checkSession();

    return () => {
      active = false;
    };
  }, [supabase]);

  // =====================================================
  // EMAIL VALIDATION
  // =====================================================

  function validateEmail(value: string): boolean {
    const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

    return emailPattern.test(value);
  }

  // =====================================================
  // HANDLE LOGIN
  // =====================================================

  async function handleLogin(
    event: FormEvent<HTMLFormElement>
  ) {
    event.preventDefault();

    if (loading) return;

    setErrorMessage("");

    const normalizedEmail = email.trim().toLowerCase();

    // -----------------------------------------------
    // Validate Email
    // -----------------------------------------------

    if (!normalizedEmail) {
      setErrorMessage("Please enter your email address.");
      return;
    }

    if (!validateEmail(normalizedEmail)) {
      setErrorMessage(
        "Please enter a valid email address."
      );
      return;
    }

    // -----------------------------------------------
    // Validate Password
    // -----------------------------------------------

    if (!password) {
      setErrorMessage("Please enter your password.");
      return;
    }

    // -----------------------------------------------
    // Begin Authentication
    // -----------------------------------------------

    setLoading(true);

    try {
      const { data, error } =
        await supabase.auth.signInWithPassword({
          email: normalizedEmail,
          password,
        });

      if (error) {
        setErrorMessage(
          "Unable to sign in. Please check your credentials and try again."
        );

        return;
      }

      if (!data.user || !data.session) {
        setErrorMessage(
          "Authentication could not be completed. Please try again."
        );

        return;
      }

      // ---------------------------------------------
      // Login Successful
      // ---------------------------------------------

      setAuthenticatedEmail(
        data.user.email ?? normalizedEmail
      );

      // Remove the password from component state.

      setPassword("");

    } catch {
      setErrorMessage(
        "Something went wrong while signing in. Please try again."
      );
    } finally {
      setLoading(false);
    }
  }

  // =====================================================
  // HANDLE LOGOUT
  // =====================================================

  async function handleLogout() {
    if (loading) return;

    setLoading(true);

    setErrorMessage("");

    try {
      const { error } = await supabase.auth.signOut();
      await clearOfflineCaches();

      if (error) {
        throw error;
      }

      setAuthenticatedEmail(null);

      setPassword("");

      setEmail("");

    } catch {
      setErrorMessage(
        "Unable to sign out. Please try again."
      );
    } finally {
      setLoading(false);
    }
  }

  // =====================================================
  // USER INTERFACE
  // =====================================================

  return (
    <main className="flex min-h-screen bg-slate-100">

      {/* ============================================= */}
      {/* LEFT BRANDING SECTION */}
      {/* ============================================= */}

      <section className="relative hidden w-1/2 flex-col justify-between overflow-hidden bg-gradient-to-br from-blue-950 via-blue-900 to-indigo-900 p-12 text-white lg:flex">

        {/* Background Decorations */}

        <div className="absolute -right-32 -top-32 h-96 w-96 rounded-full bg-blue-400/10" />

        <div className="absolute -bottom-40 -left-32 h-96 w-96 rounded-full bg-indigo-400/10" />

        {/* Logo */}

        <div className="relative z-10 flex items-center gap-4">

          <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-white/10 ring-1 ring-white/20">

            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="30"
              height="30"
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
            <h2 className="text-xl font-bold">
              School Management
            </h2>

            <p className="text-sm text-blue-200">
              Smart Education Platform
            </p>
          </div>

        </div>

        {/* Main Branding */}

        <div className="relative z-10 max-w-xl">

          <div className="mb-8 inline-flex items-center rounded-full border border-blue-300/20 bg-white/10 px-4 py-2 text-sm text-blue-100">
            Modern School Administration
          </div>

          <h1 className="text-5xl font-bold leading-tight tracking-tight xl:text-6xl">

            Smarter Schools.

            <span className="mt-2 block text-blue-300">
              Brighter Futures.
            </span>

          </h1>

          <p className="mt-8 max-w-lg text-lg leading-8 text-blue-100/80">

            One intelligent platform to manage students,
            teachers, academics, attendance, school fees,
            and communication.

          </p>

          {/* Feature Cards */}

          <div className="mt-12 grid grid-cols-2 gap-4">

            <div className="rounded-2xl border border-white/10 bg-white/10 p-5 backdrop-blur">

              <div className="mb-3 text-2xl">
                📚
              </div>

              <h3 className="font-semibold">
                Academic Management
              </h3>

              <p className="mt-2 text-sm leading-6 text-blue-100/75">
                Organize classes, subjects, and academic records.
              </p>

            </div>

            <div className="rounded-2xl border border-white/10 bg-white/10 p-5 backdrop-blur">

              <div className="mb-3 text-2xl">
                👨‍🏫
              </div>

              <h3 className="font-semibold">
                Staff & Students
              </h3>

              <p className="mt-2 text-sm leading-6 text-blue-100/75">
                Manage school communities in one place.
              </p>

            </div>

            <div className="rounded-2xl border border-white/10 bg-white/10 p-5 backdrop-blur">

              <div className="mb-3 text-2xl">
                📊
              </div>

              <h3 className="font-semibold">
                School Analytics
              </h3>

              <p className="mt-2 text-sm leading-6 text-blue-100/75">
                Make better decisions with organized information.
              </p>

            </div>

            <div className="rounded-2xl border border-white/10 bg-white/10 p-5 backdrop-blur">

              <div className="mb-3 text-2xl">
                🔐
              </div>

              <h3 className="font-semibold">
                Secure Access
              </h3>

              <p className="mt-2 text-sm leading-6 text-blue-100/75">
                Role-based access for school communities.
              </p>

            </div>

          </div>

        </div>

        {/* Footer */}

        <div className="relative z-10 text-sm text-blue-200/70">
          © {year ?? ""} School Management System.
          All rights reserved.
        </div>

      </section>

      {/* ============================================= */}
      {/* RIGHT LOGIN SECTION */}
      {/* ============================================= */}

      <section className="flex min-h-screen w-full items-center justify-center px-6 py-12 sm:px-10 lg:w-1/2">

        <div className="w-full max-w-md">

          {/* Mobile Branding */}

          <div className="mb-10 flex items-center gap-3 lg:hidden">

            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-blue-900 text-xl font-bold text-white">
              S
            </div>

            <div>
              <p className="text-lg font-bold text-slate-900">
                School Management
              </p>

              <p className="text-xs text-slate-500">
                Smart Education Platform
              </p>
            </div>

          </div>

          {/* ======================================= */}
          {/* SESSION CHECK */}
          {/* ======================================= */}

          {checkingSession ? (

            <div
              className="rounded-2xl bg-white p-10 text-center shadow-sm"
              role="status"
            >

              <div className="mx-auto mb-5 h-10 w-10 animate-spin rounded-full border-4 border-blue-100 border-t-blue-700" />

              <p className="text-slate-600">
                Checking your session...
              </p>

            </div>

          ) : authenticatedEmail ? (

            /* ===================================== */
            /* AUTHENTICATED USER VIEW */
            /* ===================================== */

            <div className="rounded-2xl bg-white p-8 text-center shadow-sm sm:p-10">

              <div className="mx-auto mb-6 flex h-20 w-20 items-center justify-center rounded-full bg-green-100 text-green-700">

                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  width="38"
                  height="38"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden="true"
                >
                  <path d="m5 12 4 4L19 6" />
                </svg>

              </div>

              <h2 className="text-2xl font-bold text-slate-900">
                Successfully Signed In
              </h2>

              <p className="mt-4 text-slate-600">
                You are authenticated as:
              </p>

              <p className="mt-2 break-all font-semibold text-blue-700">
                {authenticatedEmail}
              </p>

              <div className="mt-8 rounded-xl border border-blue-100 bg-blue-50 p-4 text-left">

                <p className="text-sm leading-6 text-blue-900">
                  Authentication is working. Your school dashboard
                  and role-based navigation will be connected in
                  the upcoming development steps.
                </p>

              </div>

              {errorMessage && (

                <div
                  role="alert"
                  className="mt-5 rounded-lg bg-red-50 p-3 text-sm text-red-700"
                >
                  {errorMessage}
                </div>

              )}

              <button
                type="button"
                onClick={handleLogout}
                disabled={loading}
                className="mt-8 w-full rounded-xl bg-slate-900 px-5 py-3.5 font-semibold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
              >

                {loading ? "Signing out..." : "Sign Out"}

              </button>

            </div>

          ) : (

            /* ===================================== */
            /* LOGIN FORM */
            /* ===================================== */

            <div>

              {/* Header */}

              <div className="mb-10">

                <p className="mb-3 text-sm font-semibold uppercase tracking-widest text-blue-700">
                  Welcome Back
                </p>

                <h2 className="text-4xl font-bold tracking-tight text-slate-900">
                  Sign in to your account
                </h2>

                <p className="mt-4 leading-7 text-slate-500">
                  Enter your credentials to access your
                  School Management System account.
                </p>

              </div>

              {/* Login Form */}

              <form
                onSubmit={handleLogin}
                className="space-y-6"
              >

                {/* EMAIL INPUT */}

                <div>

                  <label
                    htmlFor="email"
                    className="mb-2 block text-sm font-semibold text-slate-700"
                  >
                    Email Address
                  </label>

                  <input
                    id="email"
                    name="email"
                    type="email"
                    autoComplete="email"
                    placeholder="Enter your email address"
                    required
                    value={email}
                    onChange={(event) =>
                      setEmail(event.target.value)
                    }
                    disabled={loading}
                    className="w-full rounded-xl border border-slate-300 bg-white px-4 py-3.5 text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-blue-600 focus:ring-4 focus:ring-blue-100 disabled:opacity-60"
                  />

                </div>

                {/* PASSWORD INPUT */}

                <div>

                  <label
                    htmlFor="password"
                    className="mb-2 block text-sm font-semibold text-slate-700"
                  >
                    Password
                  </label>

                  <div className="relative">

                    <input
                      id="password"
                      name="password"
                      type={
                        showPassword ? "text" : "password"
                      }
                      autoComplete="current-password"
                      placeholder="Enter your password"
                      required
                      value={password}
                      onChange={(event) =>
                        setPassword(event.target.value)
                      }
                      disabled={loading}
                      className="w-full rounded-xl border border-slate-300 bg-white px-4 py-3.5 pr-20 text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-blue-600 focus:ring-4 focus:ring-blue-100 disabled:opacity-60"
                    />

                    <button
                      type="button"
                      onClick={() =>
                        setShowPassword(!showPassword)
                      }
                      disabled={loading}
                      aria-label={
                        showPassword
                          ? "Hide password"
                          : "Show password"
                      }
                      aria-pressed={showPassword}
                      className="absolute inset-y-0 right-4 text-sm font-semibold text-blue-700 hover:text-blue-900 disabled:opacity-60"
                    >

                      {showPassword ? "Hide" : "Show"}

                    </button>

                  </div>

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

                {/* LOGIN BUTTON */}

                <button
                  type="submit"
                  disabled={loading}
                  className="flex w-full items-center justify-center rounded-xl bg-blue-800 px-5 py-4 font-semibold text-white shadow-lg shadow-blue-900/10 transition hover:bg-blue-900 focus:outline-none focus:ring-4 focus:ring-blue-200 disabled:cursor-not-allowed disabled:opacity-60"
                >

                  {loading ? (

                    <span className="flex items-center gap-3">

                      <span className="h-5 w-5 animate-spin rounded-full border-2 border-white/30 border-t-white" />

                      Signing in...

                    </span>

                  ) : (

                    <span>Sign In</span>

                  )}

                </button>

              </form>

              {/* Account Information */}

              <div className="mt-10 border-t border-slate-200 pt-8">

                <div className="rounded-xl bg-blue-50 p-4">

                  <p className="text-sm font-semibold text-blue-900">
                    Need an account?
                  </p>

                  <p className="mt-2 text-sm leading-6 text-blue-800">
                    School accounts and user access will be
                    created through our upcoming secure
                    registration and onboarding process.
                  </p>

                </div>

              </div>

              {/* Footer */}

              <div className="mt-10 text-center text-sm text-slate-400">

                <p>
                  Secure authentication powered by Supabase
                </p>

                <p className="mt-2">
                  School Management System
                </p>

              </div>

            </div>

          )}

        </div>

      </section>

    </main>
  );
}