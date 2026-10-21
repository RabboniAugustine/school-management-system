-- =========================================================
-- SCHOOL MANAGEMENT SYSTEM
-- =========================================================
--
-- CODE: 007
-- MODULE: ROLE PERMISSIONS AND TENANT SECURITY
-- DATABASE: PostgreSQL / Supabase
-- VERSION: 1.0.0
--
-- DESCRIPTION:
-- Implements permission-based authorization
-- and Row Level Security for school records.
--
-- DEPENDENCIES:
-- CODE 005 - School Foundation
-- CODE 006 - Users, Roles and Memberships
--
-- SECURITY PRINCIPLES:
-- 1. Deny access by default
-- 2. Verify authenticated identity
-- 3. Verify active school membership
-- 4. Verify role permissions
-- 5. Prevent cross-school data access
-- 6. Prevent client-side privilege escalation
--
-- =========================================================


BEGIN;


-- =========================================================
-- SECTION 1: PRIVATE SECURITY SCHEMA
-- =========================================================

-- Security-definer functions must not be exposed
-- as public API functions.
--
-- This schema stores internal authorization helpers.

CREATE SCHEMA IF NOT EXISTS private;

REVOKE ALL ON SCHEMA private
FROM PUBLIC, anon, authenticated;

GRANT USAGE ON SCHEMA private
TO authenticated;


-- =========================================================
-- SECTION 2: PERMISSIONS TABLE
-- =========================================================

CREATE TABLE public.permissions (

    id UUID PRIMARY KEY
        DEFAULT gen_random_uuid(),

    code TEXT NOT NULL UNIQUE,

    name TEXT NOT NULL,

    description TEXT,

    created_by UUID
        REFERENCES auth.users(id)
        ON DELETE SET NULL,

    updated_by UUID
        REFERENCES auth.users(id)
        ON DELETE SET NULL,

    created_at TIMESTAMPTZ
        NOT NULL DEFAULT NOW(),

    updated_at TIMESTAMPTZ
        NOT NULL DEFAULT NOW(),

    CONSTRAINT permissions_code_check
        CHECK (
            code ~
            '^[a-z][a-z0-9_]*[.][a-z][a-z0-9_]*$'
        )

);


-- =========================================================
-- SECTION 3: ROLE PERMISSIONS TABLE
-- =========================================================

-- This table connects system-defined roles
-- to their allowed permissions.
--
-- These are global role templates.
-- School-specific authorization still requires
-- an active membership in the target school.

CREATE TABLE public.role_permissions (

    id UUID PRIMARY KEY
        DEFAULT gen_random_uuid(),

    role_id UUID NOT NULL
        REFERENCES public.roles(id)
        ON DELETE CASCADE,

    permission_id UUID NOT NULL
        REFERENCES public.permissions(id)
        ON DELETE CASCADE,

    created_by UUID
        REFERENCES auth.users(id)
        ON DELETE SET NULL,

    updated_by UUID
        REFERENCES auth.users(id)
        ON DELETE SET NULL,

    created_at TIMESTAMPTZ
        NOT NULL DEFAULT NOW(),

    updated_at TIMESTAMPTZ
        NOT NULL DEFAULT NOW(),

    CONSTRAINT role_permissions_unique
        UNIQUE (
            role_id,
            permission_id
        )

);


-- =========================================================
-- SECTION 4: INDEXES
-- =========================================================

CREATE INDEX idx_role_permissions_permission
ON public.role_permissions(permission_id);


-- =========================================================
-- SECTION 5: AUTOMATIC TIMESTAMPS
-- =========================================================

-- Reuse the set_updated_at function
-- created in CODE 005.

CREATE TRIGGER trg_permissions_updated_at

BEFORE UPDATE ON public.permissions

FOR EACH ROW

EXECUTE FUNCTION public.set_updated_at();



CREATE TRIGGER trg_role_permissions_updated_at

BEFORE UPDATE ON public.role_permissions

FOR EACH ROW

EXECUTE FUNCTION public.set_updated_at();


-- =========================================================
-- SECTION 6: ENABLE ROW LEVEL SECURITY
-- =========================================================

ALTER TABLE public.permissions
ENABLE ROW LEVEL SECURITY;


ALTER TABLE public.role_permissions
ENABLE ROW LEVEL SECURITY;


-- =========================================================
-- SECTION 7: DEFINE PERMISSIONS
-- =========================================================

INSERT INTO public.permissions (
    code,
    name,
    description
)

VALUES

(
    'schools.read',
    'View School',
    'View information about an authorized school'
),

(
    'branches.read',
    'View Branches',
    'View branches of an authorized school'
),

(
    'school_settings.read',
    'View School Settings',
    'View school configuration'
),

(
    'school_settings.update',
    'Update School Settings',
    'Modify permitted school configuration fields'
),

(
    'memberships.read',
    'View Memberships',
    'View users belonging to an authorized school'
),

(
    'memberships.manage',
    'Manage Memberships',
    'Reserved for trusted membership administration'
),

(
    'role_assignments.read',
    'View Role Assignments',
    'View role assignments within an authorized school'
),

(
    'role_assignments.manage',
    'Manage Role Assignments',
    'Reserved for trusted role administration'
)

ON CONFLICT (code) DO NOTHING;


-- =========================================================
-- SECTION 8: ASSIGN PERMISSIONS TO ROLES
-- =========================================================

-- Every role receives only its intended
-- foundation permissions.
--
-- Management permissions are defined now,
-- but membership and role writes remain
-- unavailable to ordinary clients.

INSERT INTO public.role_permissions (
    role_id,
    permission_id
)

SELECT
    r.id,
    p.id

FROM (

    VALUES

    -- PROPRIETOR

    ('proprietor', 'schools.read'),
    ('proprietor', 'branches.read'),
    ('proprietor', 'school_settings.read'),
    ('proprietor', 'school_settings.update'),
    ('proprietor', 'memberships.read'),
    ('proprietor', 'memberships.manage'),
    ('proprietor', 'role_assignments.read'),
    ('proprietor', 'role_assignments.manage'),


    -- SCHOOL ADMINISTRATOR

    ('school_admin', 'schools.read'),
    ('school_admin', 'branches.read'),
    ('school_admin', 'school_settings.read'),
    ('school_admin', 'school_settings.update'),
    ('school_admin', 'memberships.read'),
    ('school_admin', 'memberships.manage'),
    ('school_admin', 'role_assignments.read'),
    ('school_admin', 'role_assignments.manage'),


    -- HEAD TEACHER

    ('head_teacher', 'schools.read'),
    ('head_teacher', 'branches.read'),
    ('head_teacher', 'school_settings.read'),
    ('head_teacher', 'memberships.read'),
    ('head_teacher', 'role_assignments.read'),


    -- TEACHER

    ('teacher', 'schools.read'),
    ('teacher', 'branches.read'),


    -- BURSAR

    ('bursar', 'schools.read'),
    ('bursar', 'branches.read'),


    -- LIBRARIAN

    ('librarian', 'schools.read'),
    ('librarian', 'branches.read'),


    -- PARENT

    ('parent', 'schools.read'),
    ('parent', 'branches.read'),


    -- STUDENT

    ('student', 'schools.read'),
    ('student', 'branches.read')

) AS assigned_permissions (
    role_code,
    permission_code
)

JOIN public.roles r
    ON r.code = assigned_permissions.role_code

JOIN public.permissions p
    ON p.code = assigned_permissions.permission_code

ON CONFLICT (
    role_id,
    permission_id
)
DO NOTHING;


-- =========================================================
-- SECTION 9: SCHOOL PERMISSION VERIFICATION
-- =========================================================

-- IMPORTANT:
--
-- This function verifies permission using
-- auth.uid(), not a user ID supplied by the
-- browser.
--
-- It checks:
--
-- 1. The school is active.
-- 2. The caller has an active membership.
-- 3. The membership has an assigned role.
-- 4. The role has the requested permission.
--
-- SECURITY DEFINER avoids recursive RLS
-- checks on the membership tables.
--
-- The function lives in the private schema,
-- which must not be exposed through the API.

CREATE FUNCTION private.has_school_permission(

    p_school_id UUID,
    p_permission_code TEXT

)

RETURNS BOOLEAN

LANGUAGE SQL

STABLE

SECURITY DEFINER

SET search_path = ''

AS $$

    SELECT EXISTS (

        SELECT 1

        FROM public.school_memberships sm

        INNER JOIN public.schools s
            ON s.id = sm.school_id

        INNER JOIN public.user_roles ur
            ON ur.membership_id = sm.id
            AND ur.school_id = sm.school_id

        INNER JOIN public.role_permissions rp
            ON rp.role_id = ur.role_id

        INNER JOIN public.permissions p
            ON p.id = rp.permission_id

        WHERE
            sm.school_id = p_school_id

            AND sm.user_id = (
                SELECT auth.uid()
            )

            AND sm.status = 'active'

            AND s.status = 'active'

            AND p.code = p_permission_code

    );

$$;


-- =========================================================
-- SECTION 10: OWN MEMBERSHIP VERIFICATION
-- =========================================================

-- Used to let users view their own
-- membership and assigned roles.
--
-- A user cannot supply another user ID.
-- Ownership always uses auth.uid().

CREATE FUNCTION private.is_own_membership(

    p_school_id UUID,
    p_membership_id UUID

)

RETURNS BOOLEAN

LANGUAGE SQL

STABLE

SECURITY DEFINER

SET search_path = ''

AS $$

    SELECT EXISTS (

        SELECT 1

        FROM public.school_memberships sm

        WHERE
            sm.id = p_membership_id

            AND sm.school_id = p_school_id

            AND sm.user_id = (
                SELECT auth.uid()
            )

    );

$$;


-- =========================================================
-- SECTION 11: SECURE FUNCTION EXECUTION
-- =========================================================

-- PostgreSQL grants function execution
-- broadly by default.
--
-- Remove those defaults and permit only
-- authenticated application users.

REVOKE ALL ON FUNCTION
private.has_school_permission(UUID, TEXT)
FROM PUBLIC, anon;


REVOKE ALL ON FUNCTION
private.is_own_membership(UUID, UUID)
FROM PUBLIC, anon;


GRANT EXECUTE ON FUNCTION
private.has_school_permission(UUID, TEXT)
TO authenticated;


GRANT EXECUTE ON FUNCTION
private.is_own_membership(UUID, UUID)
TO authenticated;


-- =========================================================
-- SECTION 12: RESET CLIENT TABLE PRIVILEGES
-- =========================================================

-- Explicitly remove previous browser-role
-- privileges before granting minimum access.

REVOKE ALL ON TABLE
    public.schools,
    public.branches,
    public.school_settings,
    public.users,
    public.roles,
    public.school_memberships,
    public.user_roles,
    public.permissions,
    public.role_permissions

FROM PUBLIC, anon, authenticated;


-- =========================================================
-- SECTION 13: AUTHENTICATED READ ACCESS
-- =========================================================

-- Grants permit SELECT statements.
--
-- RLS policies below determine which
-- individual rows are visible.

GRANT SELECT ON TABLE

    public.schools,
    public.branches,
    public.school_settings,
    public.users,
    public.roles,
    public.school_memberships,
    public.user_roles,
    public.permissions,
    public.role_permissions

TO authenticated;


-- =========================================================
-- SECTION 14: SCHOOLS RLS POLICY
-- =========================================================

-- Users can only view schools for which
-- they have an active membership and
-- the schools.read permission.

CREATE POLICY schools_select_authorized

ON public.schools

FOR SELECT

TO authenticated

USING (

    private.has_school_permission(
        id,
        'schools.read'
    )

);


-- =========================================================
-- SECTION 15: BRANCHES RLS POLICY
-- =========================================================

CREATE POLICY branches_select_authorized

ON public.branches

FOR SELECT

TO authenticated

USING (

    private.has_school_permission(
        school_id,
        'branches.read'
    )

);


-- =========================================================
-- SECTION 16: SCHOOL SETTINGS READ POLICY
-- =========================================================

CREATE POLICY school_settings_select_authorized

ON public.school_settings

FOR SELECT

TO authenticated

USING (

    private.has_school_permission(
        school_id,
        'school_settings.read'
    )

);


-- =========================================================
-- SECTION 17: USERS PROFILE POLICIES
-- =========================================================

-- Users may view their own profile.
--
-- Other users' personal profile information
-- remains restricted until we build a
-- dedicated school directory.

CREATE POLICY users_select_own

ON public.users

FOR SELECT

TO authenticated

USING (

    id = (SELECT auth.uid())

);


-- Users may update their own profile.
-- Column privileges below prevent changes
-- to identity IDs and audit fields.

CREATE POLICY users_update_own

ON public.users

FOR UPDATE

TO authenticated

USING (

    id = (SELECT auth.uid())

)

WITH CHECK (

    id = (SELECT auth.uid())

);


-- =========================================================
-- SECTION 18: SCHOOL MEMBERSHIPS POLICY
-- =========================================================

-- A user can view their own membership,
-- including an invitation.
--
-- Authorized school management can view
-- memberships belonging to their school.

CREATE POLICY school_memberships_select_authorized

ON public.school_memberships

FOR SELECT

TO authenticated

USING (

    user_id = (SELECT auth.uid())

    OR

    private.has_school_permission(
        school_id,
        'memberships.read'
    )

);


-- =========================================================
-- SECTION 19: USER ROLES POLICY
-- =========================================================

-- Users can view their own assigned roles.
--
-- Authorized school management can also
-- view role assignments in their school.

CREATE POLICY user_roles_select_authorized

ON public.user_roles

FOR SELECT

TO authenticated

USING (

    private.is_own_membership(
        school_id,
        membership_id
    )

    OR

    private.has_school_permission(
        school_id,
        'role_assignments.read'
    )

);


-- =========================================================
-- SECTION 20: GLOBAL ROLE CATALOG POLICY
-- =========================================================

-- Role definitions are shared catalog data.
-- They do not grant access by themselves.

CREATE POLICY roles_select_authenticated

ON public.roles

FOR SELECT

TO authenticated

USING (TRUE);


-- =========================================================
-- SECTION 21: PERMISSIONS CATALOG POLICY
-- =========================================================

CREATE POLICY permissions_select_authenticated

ON public.permissions

FOR SELECT

TO authenticated

USING (TRUE);


-- =========================================================
-- SECTION 22: ROLE PERMISSIONS CATALOG POLICY
-- =========================================================

CREATE POLICY role_permissions_select_authenticated

ON public.role_permissions

FOR SELECT

TO authenticated

USING (TRUE);


-- =========================================================
-- SECTION 23: RESTRICTED PROFILE UPDATES
-- =========================================================

-- Authenticated users can update only
-- non-privileged profile fields.
--
-- They cannot change:
-- id, created_by, updated_by, or timestamps.

GRANT UPDATE (
    full_name,
    phone,
    avatar_url
)

ON public.users

TO authenticated;


-- =========================================================
-- SECTION 24: SCHOOL SETTINGS UPDATE POLICY
-- =========================================================

-- Only an authorized school administrator
-- or proprietor can update permitted
-- settings fields.

CREATE POLICY school_settings_update_authorized

ON public.school_settings

FOR UPDATE

TO authenticated

USING (

    private.has_school_permission(
        school_id,
        'school_settings.update'
    )

)

WITH CHECK (

    private.has_school_permission(
        school_id,
        'school_settings.update'
    )

);


-- Restrict which columns may be updated.
--
-- school_id, id, and audit fields cannot
-- be changed by browser clients.

GRANT UPDATE (
    timezone,
    currency,
    locale,
    preferences
)

ON public.school_settings

TO authenticated;


-- =========================================================
-- SECTION 25: AUTOMATIC UPDATE AUDIT ACTOR
-- =========================================================

-- Record the authenticated user responsible
-- for permitted client-side updates.
--
-- Trusted backend writes without auth.uid()
-- must explicitly supply their audit actor.

CREATE FUNCTION private.set_update_actor()

RETURNS TRIGGER

LANGUAGE plpgsql

SET search_path = ''

AS $$

BEGIN

    IF auth.uid() IS NOT NULL THEN

        NEW.updated_by := auth.uid();

    END IF;

    RETURN NEW;

END;

$$;


CREATE TRIGGER trg_users_update_actor

BEFORE UPDATE ON public.users

FOR EACH ROW

EXECUTE FUNCTION private.set_update_actor();



CREATE TRIGGER trg_school_settings_update_actor

BEFORE UPDATE ON public.school_settings

FOR EACH ROW

EXECUTE FUNCTION private.set_update_actor();


-- =========================================================
-- SECTION 26: TRUSTED SERVICE ROLE
-- =========================================================

-- Only trusted server-side infrastructure
-- may modify permission catalog records.
--
-- The service-role key must NEVER be
-- sent to the browser.

GRANT SELECT, INSERT, UPDATE, DELETE

ON TABLE
    public.permissions,
    public.role_permissions

TO service_role;


-- =========================================================
-- SECTION 27: COMPLETE MIGRATION
-- =========================================================

COMMIT;


-- =========================================================
-- END OF CODE 007
-- =========================================================