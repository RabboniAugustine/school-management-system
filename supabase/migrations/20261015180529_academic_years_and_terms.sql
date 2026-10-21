-- =====================================================
-- SCHOOL MANAGEMENT SYSTEM
-- CODE 020
-- ACADEMIC YEARS AND TERMS
-- =====================================================

BEGIN;

-- =====================================================
-- 1. ACADEMIC YEARS
-- =====================================================

CREATE TABLE public.academic_years (

    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    school_id UUID NOT NULL
        REFERENCES public.schools(id)
        ON DELETE RESTRICT,

    name TEXT NOT NULL,

    starts_on DATE NOT NULL,

    ends_on DATE NOT NULL,

    status TEXT NOT NULL DEFAULT 'planned',

    created_by UUID DEFAULT auth.uid()
        REFERENCES auth.users(id)
        ON DELETE SET NULL,

    updated_by UUID DEFAULT auth.uid()
        REFERENCES auth.users(id)
        ON DELETE SET NULL,

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT academic_year_dates_check
        CHECK (ends_on > starts_on),

    CONSTRAINT academic_year_name_check
        CHECK (
            LENGTH(BTRIM(name)) BETWEEN 3 AND 100
        ),

    CONSTRAINT academic_year_status_check
        CHECK (
            status IN (
                'planned',
                'active',
                'completed'
            )
        ),

    CONSTRAINT academic_year_unique_name
        UNIQUE (school_id, name),

    CONSTRAINT academic_year_tenant_key
        UNIQUE (school_id, id)

);

-- Only one active academic year per school.

CREATE UNIQUE INDEX academic_year_one_active
ON public.academic_years(school_id)
WHERE status = 'active';


-- =====================================================
-- 2. TERMS
-- =====================================================

CREATE TABLE public.terms (

    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    school_id UUID NOT NULL,

    academic_year_id UUID NOT NULL,

    name TEXT NOT NULL,

    term_number SMALLINT NOT NULL,

    starts_on DATE NOT NULL,

    ends_on DATE NOT NULL,

    status TEXT NOT NULL DEFAULT 'planned',

    created_by UUID DEFAULT auth.uid()
        REFERENCES auth.users(id)
        ON DELETE SET NULL,

    updated_by UUID DEFAULT auth.uid()
        REFERENCES auth.users(id)
        ON DELETE SET NULL,

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT terms_year_fk
        FOREIGN KEY (
            school_id,
            academic_year_id
        )
        REFERENCES public.academic_years(
            school_id,
            id
        )
        ON DELETE RESTRICT,

    CONSTRAINT term_dates_check
        CHECK (ends_on > starts_on),

    CONSTRAINT term_number_check
        CHECK (term_number BETWEEN 1 AND 4),

    CONSTRAINT term_name_check
        CHECK (
            LENGTH(BTRIM(name)) BETWEEN 2 AND 100
        ),

    CONSTRAINT term_status_check
        CHECK (
            status IN (
                'planned',
                'active',
                'completed'
            )
        ),

    CONSTRAINT term_unique_number
        UNIQUE (
            school_id,
            academic_year_id,
            term_number
        )

);


-- =====================================================
-- 3. INDEXES
-- =====================================================

CREATE INDEX academic_years_school_idx
ON public.academic_years(school_id);

CREATE INDEX terms_school_idx
ON public.terms(school_id);

CREATE INDEX terms_year_idx
ON public.terms(school_id, academic_year_id);


-- =====================================================
-- 4. VALIDATE TERM DATES
-- =====================================================

CREATE FUNCTION private.validate_term_dates()

RETURNS TRIGGER

LANGUAGE plpgsql

SET search_path = ''

AS $$

DECLARE

    v_year_start DATE;
    v_year_end DATE;

BEGIN

    SELECT starts_on, ends_on
    INTO v_year_start, v_year_end

    FROM public.academic_years

    WHERE id = NEW.academic_year_id
      AND school_id = NEW.school_id;

    IF NOT FOUND THEN

        RAISE EXCEPTION
            'Academic year not found.'
            USING ERRCODE = '23503';

    END IF;

    IF NEW.starts_on < v_year_start
       OR NEW.ends_on > v_year_end THEN

        RAISE EXCEPTION
            'Term dates must fall within the academic year.'
            USING ERRCODE = '23514';

    END IF;

    RETURN NEW;

END;

$$;


CREATE TRIGGER validate_term_dates_trigger

BEFORE INSERT OR UPDATE
ON public.terms

FOR EACH ROW

EXECUTE FUNCTION private.validate_term_dates();


-- =====================================================
-- 5. PREVENT YEAR DATE CHANGES THAT INVALIDATE TERMS
-- =====================================================

CREATE FUNCTION private.validate_academic_year_dates()

RETURNS TRIGGER

LANGUAGE plpgsql

SET search_path = ''

AS $$

BEGIN

    IF EXISTS (

        SELECT 1
        FROM public.terms t

        WHERE t.school_id = NEW.school_id
          AND t.academic_year_id = NEW.id

          AND (
              t.starts_on < NEW.starts_on
              OR t.ends_on > NEW.ends_on
          )

    ) THEN

        RAISE EXCEPTION
            'Academic year dates would exclude an existing term.'
            USING ERRCODE = '23514';

    END IF;

    RETURN NEW;

END;

$$;


CREATE TRIGGER validate_academic_year_dates_trigger

BEFORE UPDATE OF starts_on, ends_on
ON public.academic_years

FOR EACH ROW

EXECUTE FUNCTION private.validate_academic_year_dates();


-- =====================================================
-- 6. AUTOMATIC TIMESTAMPS AND AUDIT ACTOR
-- =====================================================

CREATE TRIGGER academic_year_updated_at

BEFORE UPDATE ON public.academic_years

FOR EACH ROW

EXECUTE FUNCTION public.set_updated_at();


CREATE TRIGGER terms_updated_at

BEFORE UPDATE ON public.terms

FOR EACH ROW

EXECUTE FUNCTION public.set_updated_at();


CREATE TRIGGER academic_year_update_actor

BEFORE UPDATE ON public.academic_years

FOR EACH ROW

EXECUTE FUNCTION private.set_update_actor();


CREATE TRIGGER terms_update_actor

BEFORE UPDATE ON public.terms

FOR EACH ROW

EXECUTE FUNCTION private.set_update_actor();


-- =====================================================
-- 7. ACADEMIC PERMISSIONS
-- =====================================================

INSERT INTO public.permissions (
    code,
    name,
    description
)

VALUES

(
    'academics.read',
    'View Academic Calendar',
    'View academic years and terms'
),

(
    'academics.manage',
    'Manage Academic Calendar',
    'Create and update academic years and terms'
)

ON CONFLICT (code) DO NOTHING;


-- Assign role permissions.

INSERT INTO public.role_permissions (
    role_id,
    permission_id
)

SELECT
    r.id,
    p.id

FROM (

    VALUES

    ('proprietor', 'academics.read'),
    ('proprietor', 'academics.manage'),

    ('school_admin', 'academics.read'),
    ('school_admin', 'academics.manage'),

    ('head_teacher', 'academics.read'),
    ('head_teacher', 'academics.manage'),

    ('teacher', 'academics.read'),

    ('bursar', 'academics.read'),

    ('librarian', 'academics.read'),

    ('parent', 'academics.read'),

    ('student', 'academics.read')

) AS assigned (
    role_code,
    permission_code
)

JOIN public.roles r
    ON r.code = assigned.role_code

JOIN public.permissions p
    ON p.code = assigned.permission_code

ON CONFLICT (role_id, permission_id)
DO NOTHING;


-- =====================================================
-- 8. ENABLE RLS
-- =====================================================

ALTER TABLE public.academic_years
ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.terms
ENABLE ROW LEVEL SECURITY;


-- =====================================================
-- 9. DATABASE GRANTS
-- =====================================================

REVOKE ALL ON public.academic_years
FROM PUBLIC, anon, authenticated;

REVOKE ALL ON public.terms
FROM PUBLIC, anon, authenticated;


GRANT SELECT ON public.academic_years
TO authenticated;

GRANT SELECT ON public.terms
TO authenticated;


GRANT INSERT (
    school_id,
    name,
    starts_on,
    ends_on
)
ON public.academic_years
TO authenticated;


GRANT INSERT (
    school_id,
    academic_year_id,
    name,
    term_number,
    starts_on,
    ends_on
)
ON public.terms
TO authenticated;


GRANT UPDATE (
    name,
    starts_on,
    ends_on,
    status
)
ON public.academic_years
TO authenticated;


GRANT UPDATE (
    name,
    term_number,
    starts_on,
    ends_on,
    status
)
ON public.terms
TO authenticated;


GRANT SELECT, INSERT, UPDATE, DELETE
ON public.academic_years
TO service_role;


GRANT SELECT, INSERT, UPDATE, DELETE
ON public.terms
TO service_role;


-- =====================================================
-- 10. ACADEMIC YEARS RLS POLICIES
-- =====================================================

CREATE POLICY academic_years_read

ON public.academic_years

FOR SELECT

TO authenticated

USING (

    private.has_school_permission(
        school_id,
        'academics.read'
    )

);


CREATE POLICY academic_years_insert

ON public.academic_years

FOR INSERT

TO authenticated

WITH CHECK (

    private.has_school_permission(
        school_id,
        'academics.manage'
    )

);


CREATE POLICY academic_years_update

ON public.academic_years

FOR UPDATE

TO authenticated

USING (

    private.has_school_permission(
        school_id,
        'academics.manage'
    )

)

WITH CHECK (

    private.has_school_permission(
        school_id,
        'academics.manage'
    )

);


-- =====================================================
-- 11. TERMS RLS POLICIES
-- =====================================================

CREATE POLICY terms_read

ON public.terms

FOR SELECT

TO authenticated

USING (

    private.has_school_permission(
        school_id,
        'academics.read'
    )

);


CREATE POLICY terms_insert

ON public.terms

FOR INSERT

TO authenticated

WITH CHECK (

    private.has_school_permission(
        school_id,
        'academics.manage'
    )

);


CREATE POLICY terms_update

ON public.terms

FOR UPDATE

TO authenticated

USING (

    private.has_school_permission(
        school_id,
        'academics.manage'
    )

)

WITH CHECK (

    private.has_school_permission(
        school_id,
        'academics.manage'
    )

);


COMMIT;

-- END CODE 020