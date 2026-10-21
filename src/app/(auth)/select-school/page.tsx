"use client";

/**
 * =====================================================
 * SCHOOL MANAGEMENT SYSTEM
 * =====================================================
 *
 * CODE: 012
 *
 * FILE:
 * src/app/(auth)/select-school/page.tsx
 *
 * MODULE:
 * Multi-School Selection
 *
 * VERSION:
 * 1.0.0
 *
 * DESCRIPTION:
 *
 * Allows authenticated users to view and select
 * schools they are authorized to access.
 *
 * FEATURES:
 *
 * - Supabase authentication verification
 * - Multi-school membership lookup
 * - Active membership filtering
 * - School information retrieval
 * - Multiple role support
 * - School selection
 * - Session storage preference
 * - Responsive user interface
 * - Error handling
 * - Empty membership state
 *
 * SECURITY:
 *
 * School visibility is controlled by PostgreSQL
 * Row Level Security policies.
 *
 * Selecting a school does not grant access.
 *
 * Protected routes must independently verify
 * authentication, membership, and permissions.
 *
 * =====================================================
 */

import {
  useEffect,
  useMemo,
  useState,
} from "react";

import Link from "next/link";

import { useRouter } from "next/navigation";

import { createClient } from "@/lib/supabase/client";


// =====================================================
// TYPES
// =====================================================

type PageStatus =
  | "loading"
  | "unauthenticated"
  | "ready"
  | "error";


interface MembershipRecord {
  id: string;
  school_id: string;
  status: string;
}


interface SchoolRecord {
  id: string;
  name: string;
  slug: string;
  status: string;
}


interface UserRoleRecord {
  membership_id: string;
  role_id: string;
}


interface RoleRecord {
  id: string;
  code: string;
  name: string;
}


interface SchoolRole {
  code: string;
  name: string;
}


interface AccessibleSchool {
  id: string;
  name: string;
  slug: string;
  roles: SchoolRole[];
}


// =====================================================
// CONSTANTS
// =====================================================

const SELECTED_SCHOOL_STORAGE_KEY =
  "sms:selected_school_id";


// =====================================================
// MAIN COMPONENT
// =====================================================

export default function SelectSchoolPage() {

  // =====================================================
  // NEXT.JS ROUTER
  // =====================================================

  const router = useRouter();

  // ===================================================
  // SUPABASE CLIENT
  // ===================================================

  const supabase = useMemo(
    () => createClient(),
    []
  );


  // ===================================================
  // PAGE STATE
  // ===================================================

  const [pageStatus, setPageStatus] =
    useState<PageStatus>("loading");

  const [userEmail, setUserEmail] =
    useState("");

  const [schools, setSchools] =
    useState<AccessibleSchool[]>([]);

  const [selectedSchoolId, setSelectedSchoolId] =
    useState<string | null>(null);

  const [inactiveMembershipCount, setInactiveMembershipCount] =
    useState(0);

  const [errorMessage, setErrorMessage] =
    useState("");

  const [refreshKey, setRefreshKey] =
    useState(0);


  // ===================================================
  // LOAD AUTHORIZED SCHOOLS
  // ===================================================

  useEffect(() => {

    let active = true;

    async function loadSchools() {

      setPageStatus("loading");

      setErrorMessage("");

      try {

        // =============================================
        // STEP 1: VERIFY AUTHENTICATED USER
        // =============================================

        const {
          data: authData,
          error: authError,
        } = await supabase.auth.getUser();

        if (!active) return;

        if (authError || !authData.user) {

          setPageStatus("unauthenticated");

          setSchools([]);

          setSelectedSchoolId(null);

          return;

        }

        const user = authData.user;

        setUserEmail(
          user.email ?? "Authenticated User"
        );


        // =============================================
        // STEP 2: FETCH USER MEMBERSHIPS
        // =============================================

        const {
          data: membershipData,
          error: membershipError,
        } = await supabase
          .from("school_memberships")
          .select(
            "id, school_id, status"
          )
          .eq("user_id", user.id);


        if (membershipError) {
          throw membershipError;
        }

        if (!active) return;


        const memberships =
          (membershipData ?? []) as MembershipRecord[];


        // =============================================
        // STEP 3: FILTER ACTIVE MEMBERSHIPS
        // =============================================

        const activeMemberships =
          memberships.filter(
            (membership) =>
              membership.status === "active"
          );


        const inactiveMemberships =
          memberships.filter(
            (membership) =>
              membership.status !== "active"
          );


        setInactiveMembershipCount(
          inactiveMemberships.length
        );


        // =============================================
        // STEP 4: HANDLE NO ACTIVE MEMBERSHIPS
        // =============================================

        if (activeMemberships.length === 0) {

          setSchools([]);

          setSelectedSchoolId(null);

          setPageStatus("ready");

          return;

        }


        // =============================================
        // STEP 5: COLLECT SCHOOL IDS
        // =============================================

        const schoolIds = [
          ...new Set(
            activeMemberships.map(
              (membership) => membership.school_id
            )
          ),
        ];


        const membershipIds =
          activeMemberships.map(
            (membership) => membership.id
          );


        // =============================================
        // STEP 6: FETCH SCHOOLS AND ROLE ASSIGNMENTS
        // =============================================

        const [
          schoolsResponse,
          assignmentsResponse,
        ] = await Promise.all([

          supabase
            .from("schools")
            .select(
              "id, name, slug, status"
            )
            .in("id", schoolIds),

          supabase
            .from("user_roles")
            .select(
              "membership_id, role_id"
            )
            .in("membership_id", membershipIds),

        ]);


        if (schoolsResponse.error) {
          throw schoolsResponse.error;
        }

        if (assignmentsResponse.error) {
          throw assignmentsResponse.error;
        }

        if (!active) return;


        const schoolRecords =
          (schoolsResponse.data ?? []) as SchoolRecord[];


        const roleAssignments =
          (assignmentsResponse.data ?? []) as UserRoleRecord[];


        // =============================================
        // STEP 7: COLLECT ROLE IDS
        // =============================================

        const roleIds = [
          ...new Set(
            roleAssignments.map(
              (assignment) => assignment.role_id
            )
          ),
        ];


        // =============================================
        // STEP 8: FETCH ROLE DETAILS
        // =============================================

        let roleRecords: RoleRecord[] = [];

        if (roleIds.length > 0) {

          const {
            data: rolesData,
            error: rolesError,
          } = await supabase
            .from("roles")
            .select(
              "id, code, name"
            )
            .in("id", roleIds);


          if (rolesError) {
            throw rolesError;
          }


          roleRecords =
            (rolesData ?? []) as RoleRecord[];

        }


        if (!active) return;


        // =============================================
        // STEP 9: CREATE LOOKUP MAPS
        // =============================================

        const schoolMap = new Map(
          schoolRecords.map(
            (school) => [school.id, school]
          )
        );


        const roleMap = new Map(
          roleRecords.map(
            (role) => [role.id, role]
          )
        );


        const membershipRoleMap =
          new Map<string, Set<string>>();


        for (const assignment of roleAssignments) {

          const existingRoles =
            membershipRoleMap.get(
              assignment.membership_id
            ) ?? new Set<string>();


          existingRoles.add(
            assignment.role_id
          );


          membershipRoleMap.set(
            assignment.membership_id,
            existingRoles
          );

        }


        // =============================================
        // STEP 10: BUILD ACCESSIBLE SCHOOL LIST
        // =============================================

        const accessibleSchools: AccessibleSchool[] = [];


        for (const membership of activeMemberships) {

          const school = schoolMap.get(
            membership.school_id
          );


          // Schools hidden by RLS are not displayed.

          if (!school) {
            continue;
          }


          // Do not display inactive schools.

          if (school.status !== "active") {
            continue;
          }


          const assignedRoleIds =
            membershipRoleMap.get(
              membership.id
            ) ?? new Set<string>();


          const schoolRoles: SchoolRole[] = [];


          for (const roleId of assignedRoleIds) {

            const role = roleMap.get(roleId);

            if (!role) {
              continue;
            }

            schoolRoles.push({
              code: role.code,
              name: role.name,
            });

          }


          // An active membership without roles
          // does not qualify for school access.

          if (schoolRoles.length === 0) {
            continue;
          }


          accessibleSchools.push({

            id: school.id,

            name: school.name,

            slug: school.slug,

            roles: schoolRoles,

          });

        }


        // =============================================
        // STEP 11: SORT SCHOOLS
        // =============================================

        accessibleSchools.sort(
          (a, b) =>
            a.name.localeCompare(b.name)
        );


        // =============================================
        // STEP 12: RESTORE PREVIOUS SELECTION
        // =============================================

        let savedSchoolId: string | null = null;

        try {

          savedSchoolId =
            window.sessionStorage.getItem(
              SELECTED_SCHOOL_STORAGE_KEY
            );

        } catch {

          // Session storage may be unavailable.
          // School selection still works.

        }


        const isSavedSchoolAccessible =
          accessibleSchools.some(
            (school) =>
              school.id === savedSchoolId
          );


        if (isSavedSchoolAccessible) {

          setSelectedSchoolId(
            savedSchoolId
          );

        } else {

          setSelectedSchoolId(null);

          try {

            window.sessionStorage.removeItem(
              SELECTED_SCHOOL_STORAGE_KEY
            );

          } catch {

            // Storage is optional.

          }

        }


        // =============================================
        // STEP 13: UPDATE STATE
        // =============================================

        setSchools(accessibleSchools);

        setPageStatus("ready");


      } catch (error) {

        console.error(
          "Unable to load school memberships:",
          error
        );

        if (!active) return;

        setErrorMessage(
          "We could not load your schools. Please check your connection and try again."
        );

        setPageStatus("error");

      }

    }


    void loadSchools();


    return () => {
      active = false;
    };

  }, [supabase, refreshKey]);


  // =====================================================
  // HANDLE SCHOOL SELECTION
  // =====================================================

  // =====================================================
  // CODE 014 - SCHOOL SELECTION AND NAVIGATION
  // =====================================================

function handleSelectSchool(
  schoolId: string
) {

  // ---------------------------------------------------
  // STEP 1: FIND THE SELECTED SCHOOL
  // ---------------------------------------------------

  const school = schools.find(
    (item) => item.id === schoolId
  );

  // Prevent navigation if the school
  // is not in the authorized school list.

  if (!school) {
    return;
  }


  // ---------------------------------------------------
  // STEP 2: SAVE SCHOOL SELECTION
  // ---------------------------------------------------

  // This is only a browser preference.
  //
  // It does NOT grant permission to access
  // the selected school's information.

  try {

    window.sessionStorage.setItem(
      SELECTED_SCHOOL_STORAGE_KEY,
      school.id
    );

  } catch {

    // School navigation can continue
    // even if browser storage is unavailable.

  }


  // ---------------------------------------------------
  // STEP 3: UPDATE COMPONENT STATE
  // ---------------------------------------------------

  setSelectedSchoolId(
    school.id
  );


  // ---------------------------------------------------
  // STEP 4: BUILD DASHBOARD URL
  // ---------------------------------------------------

  const dashboardUrl =
    `/schools/${encodeURIComponent(school.slug)}/dashboard`;


  // ---------------------------------------------------
  // STEP 5: NAVIGATE TO SCHOOL DASHBOARD
  // ---------------------------------------------------

  // IMPORTANT:
  //
  // The destination dashboard performs
  // its own server-side authorization.
  //
  // A selected school ID in browser storage
  // is never trusted as proof of access.

  router.push(
    dashboardUrl
  );

}

  // =====================================================
  // REFRESH SCHOOL LIST
  // =====================================================

  function handleRefresh() {

    setRefreshKey(
      (previous) => previous + 1
    );

  }


  // =====================================================
  // SELECTED SCHOOL INFORMATION
  // =====================================================

  const selectedSchool = schools.find(
    (school) =>
      school.id === selectedSchoolId
  );


  // =====================================================
  // AUTHENTICATION LOADING VIEW
  // =====================================================

  if (pageStatus === "loading") {

    return (

      <main className="flex min-h-screen items-center justify-center bg-slate-50 px-6">

        <div
          role="status"
          className="w-full max-w-md rounded-3xl bg-white p-10 text-center shadow-sm"
        >

          <div className="mx-auto mb-6 h-12 w-12 animate-spin rounded-full border-4 border-blue-100 border-t-blue-800" />

          <h2 className="text-xl font-bold text-slate-900">
            Loading Your Schools
          </h2>

          <p className="mt-3 text-slate-600">
            Verifying your account and school memberships...
          </p>

        </div>

      </main>

    );

  }


  // =====================================================
  // UNAUTHENTICATED VIEW
  // =====================================================

  if (pageStatus === "unauthenticated") {

    return (

      <main className="flex min-h-screen items-center justify-center bg-slate-100 px-6">

        <div className="w-full max-w-md rounded-3xl bg-white p-10 text-center shadow-xl">

          <div className="mx-auto mb-6 flex h-20 w-20 items-center justify-center rounded-full bg-blue-100 text-4xl">
            🔒
          </div>

          <h1 className="text-3xl font-bold text-slate-900">
            Sign In Required
          </h1>

          <p className="mt-4 leading-7 text-slate-600">
            Please sign in to view the schools
            associated with your account.
          </p>

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
  // ERROR VIEW
  // =====================================================

  if (pageStatus === "error") {

    return (

      <main className="flex min-h-screen items-center justify-center bg-slate-100 px-6">

        <div className="w-full max-w-md rounded-3xl bg-white p-10 text-center shadow-xl">

          <div className="mb-6 text-5xl">
            ⚠️
          </div>

          <h1 className="text-2xl font-bold text-slate-900">
            Unable to Load Schools
          </h1>

          <p
            role="alert"
            className="mt-4 leading-7 text-slate-600"
          >
            {errorMessage}
          </p>

          <button
            type="button"
            onClick={handleRefresh}
            className="mt-8 w-full rounded-xl bg-blue-800 px-6 py-4 font-semibold text-white transition hover:bg-blue-900"
          >
            Try Again
          </button>

        </div>

      </main>

    );

  }


  // =====================================================
  // MAIN SCHOOL SELECTION INTERFACE
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
                width="27"
                height="27"
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

            <p className="max-w-56 truncate text-sm font-semibold text-slate-800">
              {userEmail}
            </p>

          </div>

        </div>

      </header>


      {/* ============================================= */}
      {/* MAIN CONTENT */}
      {/* ============================================= */}

      <div className="mx-auto max-w-6xl px-6 py-12 lg:py-16">

        {/* PAGE HEADING */}

        <div className="mb-10">

          <div className="mb-5 inline-flex rounded-full bg-blue-100 px-4 py-2 text-sm font-semibold text-blue-800">
            Your School Workspace
          </div>

          <h2 className="text-4xl font-bold tracking-tight text-slate-900 md:text-5xl">
            Select Your School
          </h2>

          <p className="mt-5 max-w-2xl text-lg leading-8 text-slate-600">
            Choose the school you want to work with.
            Your available schools are determined by
            your active memberships and assigned roles.
          </p>

        </div>


        {/* =========================================== */}
        {/* PAGE ACTIONS */}
        {/* =========================================== */}

        <div className="mb-8 flex flex-wrap items-center justify-between gap-4">

          <div>

            <p className="text-sm font-semibold text-slate-700">

              {schools.length === 1
                ? "1 Available School"
                : `${schools.length} Available Schools`}

            </p>

            <p className="mt-1 text-sm text-slate-500">
              Only authorized school workspaces are displayed.
            </p>

          </div>

          <button
            type="button"
            onClick={handleRefresh}
            className="rounded-xl border border-slate-300 bg-white px-5 py-3 text-sm font-semibold text-slate-700 transition hover:bg-slate-100"
          >
            Refresh Schools
          </button>

        </div>


        {/* =========================================== */}
        {/* NO AVAILABLE SCHOOLS */}
        {/* =========================================== */}

        {schools.length === 0 ? (

          <div className="rounded-3xl border border-slate-200 bg-white px-6 py-16 text-center shadow-sm">

            <div className="mx-auto mb-6 flex h-20 w-20 items-center justify-center rounded-full bg-blue-100 text-4xl">
              🏫
            </div>

            <h3 className="text-2xl font-bold text-slate-900">
              No Schools Available
            </h3>

            <p className="mx-auto mt-4 max-w-lg leading-7 text-slate-600">
              Your account does not currently have access
              to an active school workspace.
            </p>

            {inactiveMembershipCount > 0 && (

              <div className="mx-auto mt-6 max-w-lg rounded-xl bg-amber-50 p-4">

                <p className="text-sm leading-6 text-amber-900">
                  You have {inactiveMembershipCount} inactive,
                  pending, or revoked school membership
                  {inactiveMembershipCount === 1 ? "" : "s"}.
                </p>

              </div>

            )}

            <p className="mx-auto mt-6 max-w-lg text-sm leading-7 text-slate-500">
              If you are a teacher, parent, student, or staff
              member, contact your school administrator.
              If you own or manage a new school, you can
              register it below.
            </p>

            <Link
              href="/register-school"
              className="mt-8 inline-flex rounded-xl bg-blue-800 px-8 py-4 font-semibold text-white transition hover:bg-blue-900"
            >
              Register a New School
            </Link>

          </div>

        ) : (

          /* ========================================= */
          /* AVAILABLE SCHOOL CARDS */
          /* ========================================= */

          <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">

            {schools.map((school) => {

              const isSelected =
                selectedSchoolId === school.id;


              return (

                <article
                  key={school.id}
                  className={`rounded-3xl border-2 bg-white p-6 shadow-sm transition hover:shadow-lg ${
                    isSelected
                      ? "border-blue-700 ring-4 ring-blue-100"
                      : "border-slate-200"
                  }`}
                >

                  {/* SCHOOL ICON */}

                  <div className="mb-6 flex items-start justify-between">

                    <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-blue-100 text-blue-800">

                      <svg
                        width="32"
                        height="32"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="1.7"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        aria-hidden="true"
                      >
                        <path d="M3 21h18" />
                        <path d="M5 21V7l7-4 7 4v14" />
                        <path d="M9 21v-6h6v6" />
                        <path d="M9 9h.01" />
                        <path d="M15 9h.01" />
                      </svg>

                    </div>


                    {isSelected ? (

                      <span className="rounded-full bg-green-100 px-3 py-1 text-xs font-semibold text-green-800">
                        Selected
                      </span>

                    ) : (

                      <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-600">
                        Available
                      </span>

                    )}

                  </div>


                  {/* SCHOOL NAME */}

                  <h3 className="text-xl font-bold text-slate-900">
                    {school.name}
                  </h3>


                  {/* SCHOOL IDENTIFIER */}

                  <p className="mt-2 break-all text-sm text-slate-500">
                    {school.slug}
                  </p>


                  {/* SCHOOL ROLES */}

                  <div className="mt-6">

                    <p className="mb-3 text-xs font-semibold uppercase tracking-wider text-slate-500">
                      Your Roles
                    </p>

                    <div className="flex flex-wrap gap-2">

                      {school.roles.map((role) => (

                        <span
                          key={role.code}
                          className="rounded-full bg-blue-50 px-3 py-1.5 text-xs font-semibold text-blue-800"
                        >
                          {role.name}
                        </span>

                      ))}

                    </div>

                  </div>


                  {/* SELECT BUTTON */}
                    {/* ============================================= */}
                    {/* CODE 014 - OPEN SCHOOL DASHBOARD */}
                    {/* ============================================= */}
                  <button
                    type="button"

                    onClick={() =>
                        handleSelectSchool(school.id)
                    }

                    aria-label={`Open dashboard for ${school.name}`}

                    className="mt-8 flex w-full items-center justify-center gap-3 rounded-xl bg-blue-800 px-5 py-3.5 font-semibold text-white transition hover:bg-blue-900 focus:outline-none focus:ring-4 focus:ring-blue-200"
                    >

                    <span>
                        Open School Dashboard
                    </span>

                    <svg
                        xmlns="http://www.w3.org/2000/svg"
                        width="18"
                        height="18"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        aria-hidden="true"
                    >
                        <path d="M5 12h14" />
                        <path d="m12 5 7 7-7 7" />
                    </svg>

                    </button>

                </article>

              );

            })}

          </div>

        )}


        {/* =========================================== */}
        {/* SELECTED SCHOOL CONFIRMATION */}
        {/* =========================================== */}

        {selectedSchool && (

          <div
            role="status"
            className="mt-10 rounded-3xl border border-green-200 bg-green-50 p-6 sm:p-8"
          >

            <div className="flex flex-col gap-5 sm:flex-row sm:items-center">

              <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-green-100 text-3xl text-green-700">
                ✓
              </div>

              <div className="flex-1">

                <h3 className="text-xl font-bold text-green-900">
                  School Selected Successfully
                </h3>

                <p className="mt-2 leading-7 text-green-800">
                  You selected{" "}
                  <strong>{selectedSchool.name}</strong>.
                </p>

                <p className="mt-2 text-sm leading-6 text-green-800">
                  Your selection has been remembered for
                  this browser tab. The protected school
                  dashboard will be connected in the next
                  development step.
                </p>

              </div>

            </div>

          </div>

        )}


        {/* =========================================== */}
        {/* FOOTER ACTIONS */}
        {/* =========================================== */}

        <div className="mt-12 flex flex-wrap items-center justify-between gap-5 border-t border-slate-200 pt-8">

          <div>

            <h4 className="font-semibold text-slate-900">
              Managing another school?
            </h4>

            <p className="mt-2 text-sm text-slate-600">
              Register an additional school under your account.
            </p>

          </div>

          <Link
            href="/register-school"
            className="rounded-xl border border-blue-200 bg-white px-6 py-3 font-semibold text-blue-800 transition hover:bg-blue-50"
          >
            + Register New School
          </Link>

        </div>


        {/* FOOTER */}

        <footer className="mt-16 text-center text-sm text-slate-400">
          School Management System — Secure Multi-School Platform
        </footer>

      </div>

    </main>

  );

}