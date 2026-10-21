"use client";

/**
 * =====================================================
 * SCHOOL MANAGEMENT SYSTEM
 * =====================================================
 *
 * CODE: 015
 *
 * FILE:
 * src/components/layout/DashboardLayout.tsx
 *
 * MODULE:
 * Dashboard Layout
 *
 * VERSION:
 * 1.0.0
 *
 * DESCRIPTION:
 *
 * Reusable dashboard layout for the
 * multi-tenant School Management System.
 *
 * FEATURES:
 *
 * - Responsive sidebar
 * - Collapsible desktop navigation
 * - Mobile navigation drawer
 * - School branding
 * - User account display
 * - User roles
 * - Active navigation highlighting
 * - School switching
 * - Reusable content area
 *
 * SECURITY:
 *
 * This component handles presentation only.
 *
 * Authentication, school membership, and
 * permissions must be verified on the server
 * before this component is rendered.
 *
 * =====================================================
 */

import {
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";

import Link from "next/link";

import { usePathname } from "next/navigation";


// =====================================================
// TYPES
// =====================================================

interface SchoolInformation {
  name: string;
  slug: string;
}

interface UserInformation {
  email: string;
  displayName?: string;
}

interface DashboardLayoutProps {
  school: SchoolInformation;
  user: UserInformation;
  roles: string[];
  children: ReactNode;
}

type IconName =
  | "dashboard"
  | "academic"
  | "students"
  | "attendance"
  | "exams"
  | "finance"
  | "staff"
  | "library"
  | "reports"
  | "settings"
  | "switch";

interface NavigationItem {
  label: string;
  icon: IconName;
  path?: string;
  available: boolean;
  allowedRoles?: string[];
}

interface NavigationSection {
  title: string;
  items: NavigationItem[];
}


// =====================================================
// NAVIGATION CONFIGURATION
// =====================================================

/**
 * Only routes that already exist should
 * be enabled.
 *
 * Future modules are displayed as
 * unavailable until they are implemented.
 */

const navigationSections: NavigationSection[] = [
  {
    title: "MAIN MENU",

    items: [
      {
        label: "Dashboard",
        icon: "dashboard",
        path: "dashboard",
        available: true,
      },

      {
        label: "Academic Years",
        icon: "academic",
        path: "academics/years",
        available: true,
        allowedRoles: [
          "Proprietor",
          "School Administrator",
          "Head Teacher",
          "Teacher",
        ],
      },

      {
        label: "Students",
        icon: "students",
        available: false,
      },

      {
        label: "Attendance",
        icon: "attendance",
        available: false,
      },

      {
        label: "Examinations",
        icon: "exams",
        available: false,
      },
    ],
  },

  {
    title: "MANAGEMENT",

    items: [
      {
        label: "Administration",
        icon: "staff",
        path: "admin",
        available: true,
        allowedRoles: [
          "Proprietor",
          "School Administrator",
        ],
      },

      {
        label: "Finance",
        icon: "finance",
        available: false,
        allowedRoles: [
          "Proprietor",
          "School Administrator",
          "Bursar",
        ],
      },

      {
        label: "Staff Management",
        icon: "staff",
        available: false,
        allowedRoles: [
          "Proprietor",
          "School Administrator",
        ],
      },

      {
        label: "Library",
        icon: "library",
        available: false,
      },

      {
        label: "Reports & Analytics",
        icon: "reports",
        available: false,
      },
    ],
  },

  {
    title: "CONFIGURATION",

    items: [
      {
        label: "Settings",
        icon: "settings",
        available: false,
        allowedRoles: [
          "Proprietor",
          "School Administrator",
        ],
      },
    ],
  },
];


// =====================================================
// NAVIGATION ICON COMPONENT
// =====================================================

function NavigationIcon({
  name,
}: {
  name: IconName;
}) {
  const iconPaths: Record<IconName, ReactNode> = {
    dashboard: (
      <>
        <rect x="3" y="3" width="7" height="7" rx="1" />
        <rect x="14" y="3" width="7" height="7" rx="1" />
        <rect x="3" y="14" width="7" height="7" rx="1" />
        <rect x="14" y="14" width="7" height="7" rx="1" />
      </>
    ),

    academic: (
      <>
        <path d="m2 10 10-5 10 5-10 5z" />
        <path d="M6 12v5c3 2 9 2 12 0v-5" />
        <path d="M22 10v6" />
      </>
    ),

    students: (
      <>
        <circle cx="9" cy="8" r="3" />
        <path d="M3 20v-2a6 6 0 0 1 12 0v2" />
        <path d="M17 5a3 3 0 0 1 0 6" />
        <path d="M18 15a5 5 0 0 1 3 5" />
      </>
    ),

    attendance: (
      <>
        <rect x="3" y="5" width="18" height="16" rx="2" />
        <path d="M7 3v4" />
        <path d="M17 3v4" />
        <path d="M3 10h18" />
        <path d="m9 16 2 2 4-4" />
      </>
    ),

    exams: (
      <>
        <path d="M8 3h8l4 4v14H4V3z" />
        <path d="M16 3v5h4" />
        <path d="M8 13h8" />
        <path d="M8 17h6" />
      </>
    ),

    finance: (
      <>
        <rect x="3" y="5" width="18" height="15" rx="2" />
        <path d="M3 10h18" />
        <path d="M7 15h4" />
      </>
    ),

    staff: (
      <>
        <circle cx="12" cy="7" r="4" />
        <path d="M4 21v-2a8 8 0 0 1 16 0v2" />
      </>
    ),

    library: (
      <>
        <path d="M4 4h5v16H4z" />
        <path d="M10 4h5v16h-5z" />
        <path d="m16 6 4-1 3 14-4 1z" />
      </>
    ),

    reports: (
      <>
        <path d="M4 20V10" />
        <path d="M10 20V4" />
        <path d="M16 20v-7" />
        <path d="M22 20V8" />
      </>
    ),

    settings: (
      <>
        <circle cx="12" cy="12" r="3" />
        <path d="M12 2v3" />
        <path d="M12 19v3" />
        <path d="M2 12h3" />
        <path d="M19 12h3" />
        <path d="m4.9 4.9 2.1 2.1" />
        <path d="m17 17 2.1 2.1" />
        <path d="m19.1 4.9-2.1 2.1" />
        <path d="m7 17-2.1 2.1" />
      </>
    ),

    switch: (
      <>
        <path d="M4 7h16" />
        <path d="m16 3 4 4-4 4" />
        <path d="M20 17H4" />
        <path d="m8 13-4 4 4 4" />
      </>
    ),
  };

  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="21"
      height="21"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className="shrink-0"
    >
      {iconPaths[name]}
    </svg>
  );
}


// =====================================================
// SIDEBAR CONTENT
// =====================================================

interface SidebarContentProps {
  school: SchoolInformation;
  collapsed: boolean;
  pathname: string;
  roles: string[];
  onNavigate?: () => void;
}

function SidebarContent({
  school,
  collapsed,
  pathname,
  roles,
  onNavigate,
}: SidebarContentProps) {
  const schoolBasePath =
    `/schools/${encodeURIComponent(school.slug)}`;

  return (
    <div className="flex h-full flex-col">

      {/* =========================================== */}
      {/* SCHOOL BRANDING */}
      {/* =========================================== */}

      <div className="flex min-h-20 items-center gap-3 border-b border-white/10 px-4">

        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-blue-600 text-white">

          <NavigationIcon name="academic" />

        </div>

        {!collapsed && (
          <div className="min-w-0">

            <h2 className="truncate text-sm font-bold text-white">
              {school.name}
            </h2>

            <p className="mt-1 text-xs text-blue-200">
              School Workspace
            </p>

          </div>
        )}

      </div>


      {/* =========================================== */}
      {/* NAVIGATION MENU */}
      {/* =========================================== */}

      <nav
        aria-label="School navigation"
        className="flex-1 space-y-7 overflow-y-auto px-3 py-6"
      >

        {navigationSections.map((section) => (

          <div key={section.title}>

            {!collapsed && (

              <h3 className="mb-3 px-3 text-xs font-semibold tracking-widest text-blue-300/70">
                {section.title}
              </h3>

            )}

            <div className="space-y-1">

              {section.items
                .filter((item) => {
                  if (!item.allowedRoles) {
                    return true;
                  }

                  return item.allowedRoles.some(
                    (role) => roles.includes(role)
                  );
                })
                .map((item) => {

                const href =
                  item.path
                    ? `${schoolBasePath}/${item.path}`
                    : undefined;

                const isActive =
                  Boolean(href) &&
                  pathname === href;

                const baseClasses =
                  "flex min-h-11 items-center gap-3 rounded-xl px-3 py-3 text-sm font-medium transition";

                const activeClasses =
                  "bg-blue-600 text-white";

                const normalClasses =
                  "text-blue-100 hover:bg-white/10 hover:text-white";

                const disabledClasses =
                  "cursor-not-allowed text-blue-300/40";

                const label = (
                  <>
                    <NavigationIcon name={item.icon} />

                    <span
                      className={
                        collapsed
                          ? "sr-only"
                          : "min-w-0 flex-1 truncate"
                      }
                    >
                      {item.label}
                    </span>

                    {!collapsed && !item.available && (
                      <span className="rounded-md bg-white/10 px-2 py-1 text-[10px] text-blue-200/70">
                        Soon
                      </span>
                    )}
                  </>
                );

                if (item.available && href) {

                  return (
                    <Link
                      key={item.label}
                      href={href}
                      onClick={onNavigate}
                      title={
                        collapsed
                          ? item.label
                          : undefined
                      }
                      aria-current={
                        isActive
                          ? "page"
                          : undefined
                      }
                      className={`${baseClasses} ${
                        isActive
                          ? activeClasses
                          : normalClasses
                      }`}
                    >
                      {label}
                    </Link>
                  );

                }

                return (
                  <div
                    key={item.label}
                    aria-disabled="true"
                    title={`${item.label} — Coming soon`}
                    className={`${baseClasses} ${disabledClasses}`}
                  >
                    {label}
                  </div>
                );

              })}

            </div>

          </div>

        ))}

      </nav>


      {/* =========================================== */}
      {/* SIDEBAR FOOTER */}
      {/* =========================================== */}

      <div className="border-t border-white/10 p-3">

        <Link
          href="/select-school"
          onClick={onNavigate}
          title={
            collapsed
              ? "Switch School"
              : undefined
          }
          className="flex min-h-11 items-center gap-3 rounded-xl px-3 py-3 text-sm font-medium text-blue-100 transition hover:bg-white/10 hover:text-white"
        >

          <NavigationIcon name="switch" />

          <span
            className={
              collapsed
                ? "sr-only"
                : ""
            }
          >
            Switch School
          </span>

        </Link>

      </div>

    </div>
  );
}


// =====================================================
// MAIN DASHBOARD LAYOUT
// =====================================================

export default function DashboardLayout({
  school,
  user,
  roles,
  children,
}: DashboardLayoutProps) {

  // ===================================================
  // ROUTING
  // ===================================================

  const pathname = usePathname();


  // ===================================================
  // SIDEBAR STATE
  // ===================================================

  const [sidebarCollapsed, setSidebarCollapsed] =
    useState(false);

  const [mobileSidebarOpen, setMobileSidebarOpen] =
    useState(false);


  // ===================================================
  // ACCESSIBILITY REFS
  // ===================================================

  const menuButtonRef =
    useRef<HTMLButtonElement>(null);

  const closeButtonRef =
    useRef<HTMLButtonElement>(null);


  // ===================================================
  // CLOSE MOBILE SIDEBAR WITH ESCAPE
  // ===================================================

  useEffect(() => {

    if (!mobileSidebarOpen) {
      return;
    }

    const previousOverflow =
      document.body.style.overflow;

    document.body.style.overflow = "hidden";

    closeButtonRef.current?.focus();

    function handleKeyDown(event: KeyboardEvent) {

      if (event.key === "Escape") {
        setMobileSidebarOpen(false);
        menuButtonRef.current?.focus();
      }

    }

    window.addEventListener(
      "keydown",
      handleKeyDown
    );

    return () => {

      window.removeEventListener(
        "keydown",
        handleKeyDown
      );

      document.body.style.overflow =
        previousOverflow;

    };

  }, [mobileSidebarOpen]);


  // ===================================================
  // USER DISPLAY INFORMATION
  // ===================================================

  const displayName =
    user.displayName?.trim() ||
    user.email ||
    "School User";

  const userInitial =
    displayName.charAt(0).toUpperCase();

  const primaryRole =
    roles.length > 0
      ? roles[0]
      : "School Member";


  // ===================================================
  // COMPONENT INTERFACE
  // ===================================================

  return (

    <div className="min-h-screen bg-slate-50">

      {/* ============================================= */}
      {/* DESKTOP SIDEBAR */}
      {/* ============================================= */}

      <aside
        className={`fixed inset-y-0 left-0 z-30 hidden bg-slate-950 transition-[width] duration-300 lg:block ${
          sidebarCollapsed
            ? "w-20"
            : "w-72"
        }`}
      >

        <SidebarContent
          school={school}
          collapsed={sidebarCollapsed}
          pathname={pathname}
          roles={roles}
        />

      </aside>


      {/* ============================================= */}
      {/* MOBILE SIDEBAR */}
      {/* ============================================= */}

      {mobileSidebarOpen && (

        <div className="fixed inset-0 z-50 lg:hidden">

          {/* Overlay */}

          <button
            type="button"
            aria-label="Close navigation menu"
            onClick={() =>
              setMobileSidebarOpen(false)
            }
            className="absolute inset-0 bg-slate-950/60"
          />

          {/* Mobile Navigation */}

          <aside
            aria-label="Mobile school navigation"
            className="absolute inset-y-0 left-0 w-72 max-w-[85vw] bg-slate-950 shadow-2xl"
          >

            <button
              ref={closeButtonRef}
              type="button"
              aria-label="Close sidebar"
              onClick={() =>
                setMobileSidebarOpen(false)
              }
              className="absolute right-3 top-5 z-10 flex h-9 w-9 items-center justify-center rounded-lg bg-white/10 text-white"
            >
              ✕
            </button>

            <SidebarContent
              school={school}
              collapsed={false}
              pathname={pathname}
              roles={roles}
              onNavigate={() =>
                setMobileSidebarOpen(false)
              }
            />

          </aside>

        </div>

      )}


      {/* ============================================= */}
      {/* MAIN APPLICATION AREA */}
      {/* ============================================= */}

      <div
        className={`min-h-screen transition-[margin] duration-300 ${
          sidebarCollapsed
            ? "lg:ml-20"
            : "lg:ml-72"
        }`}
      >

        {/* =========================================== */}
        {/* TOP NAVIGATION */}
        {/* =========================================== */}

        <header className="sticky top-0 z-20 border-b border-slate-200 bg-white">

          <div className="flex min-h-20 items-center justify-between gap-4 px-4 sm:px-6 lg:px-8">

            {/* LEFT CONTROLS */}

            <div className="flex min-w-0 items-center gap-4">

              {/* Mobile Menu Button */}

              <button
                ref={menuButtonRef}
                type="button"
                onClick={() =>
                  setMobileSidebarOpen(true)
                }
                aria-label="Open navigation menu"
                aria-expanded={mobileSidebarOpen}
                className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-slate-200 text-slate-700 lg:hidden"
              >

                <svg
                  width="22"
                  height="22"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  aria-hidden="true"
                >
                  <path d="M4 6h16" />
                  <path d="M4 12h16" />
                  <path d="M4 18h16" />
                </svg>

              </button>


              {/* Desktop Collapse Button */}

              <button
                type="button"
                onClick={() =>
                  setSidebarCollapsed(
                    (previous) => !previous
                  )
                }
                aria-label={
                  sidebarCollapsed
                    ? "Expand sidebar"
                    : "Collapse sidebar"
                }
                aria-expanded={!sidebarCollapsed}
                className="hidden h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-slate-200 text-slate-700 transition hover:bg-slate-100 lg:flex"
              >

                <svg
                  width="21"
                  height="21"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  aria-hidden="true"
                >
                  <path d="M4 6h16" />
                  <path d="M4 12h16" />
                  <path d="M4 18h16" />
                </svg>

              </button>


              {/* Current School */}

              <div className="min-w-0">

                <p className="text-xs font-medium text-slate-500">
                  Current School
                </p>

                <h2 className="truncate text-sm font-bold text-slate-900 sm:text-base">
                  {school.name}
                </h2>

              </div>

            </div>


            {/* RIGHT CONTROLS */}

            <div className="flex shrink-0 items-center gap-3 sm:gap-5">

              {/* School Switcher */}

              <Link
                href="/select-school"
                className="hidden rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-semibold text-slate-700 transition hover:bg-slate-100 sm:inline-flex"
              >
                Switch School
              </Link>


              {/* User Account */}

              <div className="flex items-center gap-3">

                <div className="hidden text-right md:block">

                  <p className="max-w-44 truncate text-sm font-semibold text-slate-900">
                    {displayName}
                  </p>

                  <p className="mt-1 text-xs text-slate-500">
                    {primaryRole}
                  </p>

                </div>


                {/* User Avatar */}

                <div
                  title={displayName}
                  aria-label={`Signed in as ${displayName}`}
                  className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-blue-100 text-base font-bold text-blue-800"
                >
                  {userInitial}
                </div>

              </div>

            </div>

          </div>

        </header>


        {/* =========================================== */}
        {/* MAIN CONTENT AREA */}
        {/* =========================================== */}

        <main
          id="main-content"
          className="mx-auto w-full max-w-screen-2xl px-4 py-6 sm:px-6 lg:px-8 lg:py-8"
        >

          {children}

        </main>


        {/* =========================================== */}
        {/* APPLICATION FOOTER */}
        {/* =========================================== */}

        <footer className="border-t border-slate-200 px-4 py-5 text-center text-xs text-slate-500 sm:px-6">

          <p>
            © {new Date().getFullYear()} School Management System.
            All rights reserved.
          </p>

          <p className="mt-1">
            Secure Multi-School Management Platform
          </p>

        </footer>

      </div>

    </div>

  );

}