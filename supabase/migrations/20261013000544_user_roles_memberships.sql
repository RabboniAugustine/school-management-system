-- =========================================================
-- SCHOOL MANAGEMENT SYSTEM
-- =========================================================
--
-- CODE: 006
-- MODULE: IDENTITY AND SCHOOL MEMBERSHIPS
-- DATABASE: PostgreSQL / Supabase
-- VERSION: 1.0.0
--
-- DESCRIPTION:
-- Creates the identity and role assignment
-- foundation for our multi-tenant platform.
--
-- TABLES:
-- 1. users
-- 2. roles
-- 3. school_memberships
-- 4. user_roles
--
-- SECURITY:
-- Row Level Security enabled.
-- Client access denied until authorization
-- policies are implemented.
--
-- DEPENDENCY:
-- CODE 005 must already be applied.
--
-- =========================================================


BEGIN;


-- =========================================================
-- SECTION 1: USERS TABLE
-- =========================================================

-- The auth.users table is managed by Supabase.
-- This table stores additional application
-- profile information.
--
-- A user can belong to multiple schools.
-- School membership is therefore stored
-- separately.


CREATE TABLE public.users (

    id UUID PRIMARY KEY
        REFERENCES auth.users(id)
        ON DELETE CASCADE,

    full_name TEXT,

    phone TEXT,

    avatar_url TEXT,

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

    CONSTRAINT users_full_name_check
        CHECK (
            full_name IS NULL
            OR LENGTH(BTRIM(full_name))
               BETWEEN 2 AND 160
        )

);


-- =========================================================
-- SECTION 2: ROLES TABLE
-- =========================================================

-- Stores the school-level roles available
-- throughout the platform.
--
-- Platform super admins will be managed
-- separately in a later development step.


CREATE TABLE public.roles (

    id UUID PRIMARY KEY
        DEFAULT gen_random_uuid(),

    code TEXT NOT NULL UNIQUE,

    name TEXT NOT NULL,

    description TEXT,

    is_system BOOLEAN
        NOT NULL DEFAULT TRUE,

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

    CONSTRAINT roles_code_check
        CHECK (
            code ~ '^[a-z][a-z0-9_]*$'
        )

);


-- =========================================================
-- SECTION 3: SCHOOL MEMBERSHIPS
-- =========================================================

-- Links users to schools.
--
-- A user may belong to more than one school,
-- but may only have one membership record
-- per school.
--
-- Memberships must not automatically
-- become active without authorization.


CREATE TABLE public.school_memberships (

    id UUID PRIMARY KEY
        DEFAULT gen_random_uuid(),

    school_id UUID NOT NULL
        REFERENCES public.schools(id)
        ON DELETE RESTRICT,

    user_id UUID NOT NULL
        REFERENCES public.users(id)
        ON DELETE CASCADE,

    status TEXT NOT NULL DEFAULT 'invited',

    joined_at TIMESTAMPTZ,

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

    CONSTRAINT school_memberships_status_check
        CHECK (
            status IN (
                'invited',
                'active',
                'suspended',
                'revoked'
            )
        ),

    CONSTRAINT school_memberships_unique_user
        UNIQUE (school_id, user_id),

    CONSTRAINT school_memberships_tenant_key
        UNIQUE (school_id, id)

);


-- =========================================================
-- SECTION 4: USER ROLE ASSIGNMENTS
-- =========================================================

-- Assigns roles to school memberships.
--
-- Each membership can have multiple roles.
--
-- The composite foreign key ensures the
-- school_id matches the school_id of
-- the referenced membership.


CREATE TABLE public.user_roles (

    id UUID PRIMARY KEY
        DEFAULT gen_random_uuid(),

    school_id UUID NOT NULL,

    membership_id UUID NOT NULL,

    role_id UUID NOT NULL
        REFERENCES public.roles(id)
        ON DELETE RESTRICT,

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

    CONSTRAINT user_roles_membership_fk
        FOREIGN KEY (
            school_id,
            membership_id
        )
        REFERENCES public.school_memberships(
            school_id,
            id
        )
        ON DELETE CASCADE,

    CONSTRAINT user_roles_unique_assignment
        UNIQUE (
            membership_id,
            role_id
        )

);


-- =========================================================
-- SECTION 5: DATABASE INDEXES
-- =========================================================

-- Find memberships belonging to a user.

CREATE INDEX idx_school_memberships_user
ON public.school_memberships(user_id);


-- Find memberships belonging to a school.

CREATE INDEX idx_school_memberships_school
ON public.school_memberships(school_id);


-- Efficiently filter active memberships.

CREATE INDEX idx_school_memberships_active
ON public.school_memberships(school_id, user_id)
WHERE status = 'active';


-- Find roles belonging to a membership.

CREATE INDEX idx_user_roles_membership
ON public.user_roles(membership_id);


-- Find role assignments within a school.

CREATE INDEX idx_user_roles_school
ON public.user_roles(school_id);


-- Find assignments for a particular role.

CREATE INDEX idx_user_roles_role
ON public.user_roles(role_id);


-- =========================================================
-- SECTION 6: UPDATED_AT TRIGGERS
-- =========================================================

-- Reuse the timestamp function
-- created during CODE 005.


CREATE TRIGGER trg_users_updated_at

BEFORE UPDATE ON public.users

FOR EACH ROW

EXECUTE FUNCTION public.set_updated_at();



CREATE TRIGGER trg_roles_updated_at

BEFORE UPDATE ON public.roles

FOR EACH ROW

EXECUTE FUNCTION public.set_updated_at();



CREATE TRIGGER trg_school_memberships_updated_at

BEFORE UPDATE ON public.school_memberships

FOR EACH ROW

EXECUTE FUNCTION public.set_updated_at();



CREATE TRIGGER trg_user_roles_updated_at

BEFORE UPDATE ON public.user_roles

FOR EACH ROW

EXECUTE FUNCTION public.set_updated_at();


-- =========================================================
-- SECTION 7: ENABLE ROW LEVEL SECURITY
-- =========================================================

ALTER TABLE public.users
ENABLE ROW LEVEL SECURITY;


ALTER TABLE public.roles
ENABLE ROW LEVEL SECURITY;


ALTER TABLE public.school_memberships
ENABLE ROW LEVEL SECURITY;


ALTER TABLE public.user_roles
ENABLE ROW LEVEL SECURITY;


-- =========================================================
-- SECTION 8: RESTRICT CLIENT ACCESS
-- =========================================================

-- These tables are not accessible through
-- ordinary browser clients yet.
--
-- We will introduce narrowly scoped grants
-- and RLS policies in the next migration.


REVOKE ALL ON TABLE public.users
FROM PUBLIC, anon, authenticated;


REVOKE ALL ON TABLE public.roles
FROM PUBLIC, anon, authenticated;


REVOKE ALL ON TABLE public.school_memberships
FROM PUBLIC, anon, authenticated;


REVOKE ALL ON TABLE public.user_roles
FROM PUBLIC, anon, authenticated;


-- Trusted service-role operations.
--
-- The service role must never be exposed
-- to browser-side application code.


GRANT SELECT, INSERT, UPDATE, DELETE
ON TABLE public.users
TO service_role;


GRANT SELECT, INSERT, UPDATE, DELETE
ON TABLE public.roles
TO service_role;


GRANT SELECT, INSERT, UPDATE, DELETE
ON TABLE public.school_memberships
TO service_role;


GRANT SELECT, INSERT, UPDATE, DELETE
ON TABLE public.user_roles
TO service_role;


-- =========================================================
-- SECTION 9: INSERT DEFAULT SCHOOL ROLES
-- =========================================================

-- Only school-level roles are inserted.
-- No platform super-admin role is assigned.


INSERT INTO public.roles (
    code,
    name,
    description
)

VALUES

(
    'proprietor',
    'Proprietor',
    'School owner with management responsibilities'
),

(
    'school_admin',
    'School Administrator',
    'Manages school administration and operations'
),

(
    'head_teacher',
    'Head Teacher',
    'Oversees teaching and academic operations'
),

(
    'teacher',
    'Teacher',
    'Manages assigned teaching responsibilities'
),

(
    'bursar',
    'Bursar',
    'Manages school fees and financial records'
),

(
    'librarian',
    'Librarian',
    'Manages school library operations'
),

(
    'parent',
    'Parent',
    'Accesses information about linked children'
),

(
    'student',
    'Student',
    'Accesses personal academic information'
)

ON CONFLICT (code) DO NOTHING;


-- =========================================================
-- SECTION 10: COMPLETE MIGRATION
-- =========================================================

COMMIT;

-- =========================================================
-- END OF CODE 006
-- =========================================================