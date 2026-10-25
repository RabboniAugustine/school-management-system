/**
 * Single source of truth for school navigation. The sidebar and the dashboard quick links are both built
 * from this list, filtered by what the signed-in user's roles are permitted to do.
 *
 * Hiding a link is only a convenience: every page still checks access on the server and the database
 * enforces permissions with row-level security.
 */
export type IconName =
  | "dashboard" | "academic" | "students" | "attendance" | "exams" | "finance" | "staff"
  | "library" | "reports" | "settings" | "switch" | "message" | "bus" | "bed" | "clock" | "idcard";

export interface NavigationItem {
  label: string;
  icon: IconName;
  path: string;
  available: boolean;
}

export interface NavigationSection {
  title: string;
  items: NavigationItem[];
}

type Definition = { label: string; icon: IconName; path: string; permission?: string | string[]; adminOnly?: boolean };

const DEFINITIONS: { title: string; items: Definition[] }[] = [
  { title: "MAIN MENU", items: [
    { label: "Dashboard", icon: "dashboard", path: "dashboard" },
    { label: "My family", icon: "students", path: "portal", permission: "portal.read" },
  ] },
  { title: "ACADEMICS", items: [
    { label: "Academic years", icon: "academic", path: "academics/years", permission: "academics.read" },
    { label: "Classes & streams", icon: "academic", path: "academics/classes", permission: "classes.read" },
    { label: "Subjects", icon: "academic", path: "academics/subjects", permission: "subjects.read" },
    { label: "Enrollments", icon: "students", path: "academics/enrollments", permission: "enrollments.read" },
    { label: "Timetable", icon: "clock", path: "timetable", permission: "timetable.read" },
    { label: "Attendance", icon: "attendance", path: "attendance", permission: "attendance.read" },
    { label: "Grades & reports", icon: "exams", path: "grades", permission: "grades.read" },
  ] },
  { title: "PEOPLE", items: [
    { label: "Students", icon: "students", path: "students", permission: "students.read" },
    { label: "Staff", icon: "staff", path: "staff", permission: "staff.read" },
    { label: "ID cards", icon: "idcard", path: "id-cards", permission: "students.read" },
    { label: "Portal access", icon: "settings", path: "portal/access", permission: "portal.manage" },
  ] },
  { title: "FINANCE & HR", items: [
    { label: "Fees & finance", icon: "finance", path: "fees", permission: "fees.read" },
    { label: "HR & payroll", icon: "staff", path: "hr", permission: ["hr.read", "payroll.read", "leave.request"] },
  ] },
  { title: "OPERATIONS", items: [
    { label: "Library", icon: "library", path: "library", permission: "library.read" },
    { label: "Transport", icon: "bus", path: "transport", permission: "transport.read" },
    { label: "Hostel", icon: "bed", path: "hostel", permission: "hostel.read" },
    { label: "Communication", icon: "message", path: "communication", permission: "communication.read" },
  ] },
  { title: "INSIGHTS", items: [
    { label: "Reports", icon: "reports", path: "reports", permission: "reports.read" },
  ] },
  { title: "MANAGEMENT", items: [
    { label: "Administration", icon: "settings", path: "admin", adminOnly: true },
  ] },
];

export function buildNavigation(permissions: ReadonlySet<string> | readonly string[], isAdmin: boolean): NavigationSection[] {
  const has = (code: string) => (permissions instanceof Set ? permissions.has(code) : (permissions as readonly string[]).includes(code));
  // Parents and students only use the family portal; they should not see school set-up screens
  // even though their role can read a few lookup tables behind the scenes.
  const portalOnly = has("portal.read") && !has("students.read");
  const allowed = (d: Definition) =>
    portalOnly ? !d.adminOnly && (!d.permission || (Array.isArray(d.permission) ? d.permission : [d.permission]).some((p) => p.startsWith("portal."))) : true;

  return DEFINITIONS
    .map((section) => ({
      title: section.title,
      items: section.items
        .filter(allowed)
        .filter((d) => (d.adminOnly ? isAdmin : !d.permission || (Array.isArray(d.permission) ? d.permission : [d.permission]).some(has)))
        .map((d) => ({ label: d.label, icon: d.icon, path: d.path, available: true })),
    }))
    .filter((section) => section.items.length > 0);
}

/** Roles that may open the administration area (the page itself verifies this again on the server). */
export function isAdminRole(roleNames: string[]): boolean {
  return roleNames.some((r) => r === "Proprietor" || r === "School Administrator");
}
