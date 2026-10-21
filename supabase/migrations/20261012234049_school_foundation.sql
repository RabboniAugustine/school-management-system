-- =========================================================
-- SCHOOL MANAGEMENT SYSTEM
-- =========================================================
--
-- CODE: 005
-- MODULE: SCHOOL FOUNDATION
-- DATABASE: PostgreSQL / Supabase
-- VERSION: 1.0.0
--
-- DESCRIPTION:
-- Creates the foundational database tables for a
-- multi-tenant School Management System.
--
-- TABLES:
--   1. schools
--   2. branches
--   3. school_settings
--
-- SECURITY:
--   - UUID primary keys
--   - Foreign key relationships
--   - Row Level Security enabled
--   - Client access denied by default
--
-- =========================================================


BEGIN;


-- =========================================================
-- SECTION 1: SCHOOLS TABLE
-- =========================================================

CREATE TABLE public.schools (

    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    name TEXT NOT NULL,

    slug TEXT NOT NULL UNIQUE,

    email TEXT,

    phone TEXT,

    address TEXT,

    status TEXT NOT NULL DEFAULT 'draft',

    created_by UUID REFERENCES auth.users(id)
        ON DELETE SET NULL,

    updated_by UUID REFERENCES auth.users(id)
        ON DELETE SET NULL,

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT schools_name_check
        CHECK (
            LENGTH(BTRIM(name)) BETWEEN 2 AND 200
        ),

    CONSTRAINT schools_slug_check
        CHECK (
            LENGTH(slug) BETWEEN 3 AND 80
            AND slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'
        ),

    CONSTRAINT schools_status_check
        CHECK (
            status IN (
                'draft',
                'active',
                'suspended',
                'archived'
            )
        )

);


-- =========================================================
-- SECTION 2: BRANCHES TABLE
-- =========================================================

CREATE TABLE public.branches (

    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    school_id UUID NOT NULL,

    name TEXT NOT NULL,

    code TEXT NOT NULL,

    address TEXT,

    phone TEXT,

    email TEXT,

    is_main BOOLEAN NOT NULL DEFAULT FALSE,

    is_active BOOLEAN NOT NULL DEFAULT TRUE,

    created_by UUID REFERENCES auth.users(id)
        ON DELETE SET NULL,

    updated_by UUID REFERENCES auth.users(id)
        ON DELETE SET NULL,

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT branches_school_fk
        FOREIGN KEY (school_id)
        REFERENCES public.schools(id)
        ON DELETE RESTRICT,

    CONSTRAINT branches_name_check
        CHECK (
            LENGTH(BTRIM(name)) BETWEEN 2 AND 200
        ),

    CONSTRAINT branches_code_check
        CHECK (
            LENGTH(code) BETWEEN 2 AND 20
        ),

    CONSTRAINT branches_school_code_unique
        UNIQUE (school_id, code)

);


-- =========================================================
-- SECTION 3: SCHOOL SETTINGS TABLE
-- =========================================================

CREATE TABLE public.school_settings (

    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    school_id UUID NOT NULL UNIQUE,

    timezone TEXT NOT NULL DEFAULT 'Africa/Accra',

    currency TEXT NOT NULL DEFAULT 'GHS',

    locale TEXT NOT NULL DEFAULT 'en-GH',

    preferences JSONB NOT NULL DEFAULT '{}'::JSONB,

    created_by UUID REFERENCES auth.users(id)
        ON DELETE SET NULL,

    updated_by UUID REFERENCES auth.users(id)
        ON DELETE SET NULL,

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT school_settings_school_fk
        FOREIGN KEY (school_id)
        REFERENCES public.schools(id)
        ON DELETE RESTRICT,

    CONSTRAINT school_settings_currency_check
        CHECK (
            currency ~ '^[A-Z]{3}$'
        ),

    CONSTRAINT school_settings_preferences_check
        CHECK (
            JSONB_TYPEOF(preferences) = 'object'
        )

);


-- =========================================================
-- SECTION 4: DATABASE INDEXES
-- =========================================================

-- Improve school status filtering.

CREATE INDEX idx_schools_status
ON public.schools(status);


-- Improve school branch lookups.

CREATE INDEX idx_branches_school_id
ON public.branches(school_id);


-- A school can have at most one main branch.

CREATE UNIQUE INDEX idx_branches_one_main
ON public.branches(school_id)
WHERE is_main = TRUE;


-- =========================================================
-- SECTION 5: AUTOMATIC UPDATED_AT FUNCTION
-- =========================================================

CREATE FUNCTION public.set_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN

    NEW.updated_at = NOW();

    RETURN NEW;

END;
$$;


-- =========================================================
-- SECTION 6: AUTOMATIC TIMESTAMP TRIGGERS
-- =========================================================

CREATE TRIGGER trg_schools_updated_at

BEFORE UPDATE ON public.schools

FOR EACH ROW

EXECUTE FUNCTION public.set_updated_at();



CREATE TRIGGER trg_branches_updated_at

BEFORE UPDATE ON public.branches

FOR EACH ROW

EXECUTE FUNCTION public.set_updated_at();



CREATE TRIGGER trg_school_settings_updated_at

BEFORE UPDATE ON public.school_settings

FOR EACH ROW

EXECUTE FUNCTION public.set_updated_at();


-- =========================================================
-- SECTION 7: ENABLE ROW LEVEL SECURITY
-- =========================================================

ALTER TABLE public.schools
ENABLE ROW LEVEL SECURITY;


ALTER TABLE public.branches
ENABLE ROW LEVEL SECURITY;


ALTER TABLE public.school_settings
ENABLE ROW LEVEL SECURITY;


-- =========================================================
-- SECTION 8: DENY CLIENT ACCESS BY DEFAULT
-- =========================================================

-- Remove permissions from public and browser roles.
-- We will grant only necessary permissions after
-- implementing school memberships and RLS policies.

REVOKE ALL ON TABLE public.schools
FROM PUBLIC, anon, authenticated;


REVOKE ALL ON TABLE public.branches
FROM PUBLIC, anon, authenticated;


REVOKE ALL ON TABLE public.school_settings
FROM PUBLIC, anon, authenticated;


-- Service role access is reserved for trusted
-- server-side operations. Never expose its key
-- in browser code.

GRANT SELECT, INSERT, UPDATE, DELETE
ON TABLE public.schools
TO service_role;


GRANT SELECT, INSERT, UPDATE, DELETE
ON TABLE public.branches
TO service_role;


GRANT SELECT, INSERT, UPDATE, DELETE
ON TABLE public.school_settings
TO service_role;


-- =========================================================
-- SECTION 9: COMPLETE MIGRATION
-- =========================================================

COMMIT;

-- =========================================================
-- END OF CODE 005
-- =========================================================