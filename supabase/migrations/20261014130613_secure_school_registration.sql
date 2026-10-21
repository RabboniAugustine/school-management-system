-- =========================================================
-- SCHOOL MANAGEMENT SYSTEM
-- =========================================================
--
-- CODE: 010
-- MODULE: SECURE SCHOOL REGISTRATION
-- DATABASE: PostgreSQL / Supabase
-- VERSION: 1.0.0
--
-- DESCRIPTION:
--
-- Provides a secure, transactional process
-- for registering a new school.
--
-- FEATURES:
-- 1. Authentication verification
-- 2. Verified account requirement
-- 3. School data validation
-- 4. Unique school slug validation
-- 5. School creation
-- 6. Main branch creation
-- 7. Default school settings
-- 8. School owner membership
-- 9. Proprietor role assignment
-- 10. Transactional consistency
--
-- SECURITY:
--
-- - Caller identity comes from auth.uid()
-- - No user ID is accepted from the browser
-- - No direct client table INSERT permissions
-- - Privileged implementation stays private
-- - School registration does not grant
--   privileges over existing unrelated schools
--
-- DEPENDENCIES:
--
-- CODE 005
-- CODE 006
-- CODE 007
-- CODE 009
--
-- =========================================================

BEGIN;


-- =========================================================
-- SECTION 1: PRIVATE SCHOOL REGISTRATION FUNCTION
-- =========================================================

-- SECURITY DEFINER is necessary because
-- regular authenticated users cannot directly
-- insert schools or assign proprietor roles.
--
-- This privileged function lives in the
-- private schema, not the exposed API schema.
--
-- The function only creates a NEW school
-- owned by the currently authenticated user.

CREATE FUNCTION private.create_school_with_owner(

    p_school_name TEXT,
    p_school_slug TEXT,
    p_branch_name TEXT

)

RETURNS UUID

LANGUAGE plpgsql

VOLATILE

SECURITY DEFINER

SET search_path = ''

AS $$

DECLARE

    v_user_id UUID;

    v_school_id UUID;

    v_existing_school_id UUID;

    v_branch_id UUID;

    v_membership_id UUID;

    v_proprietor_role_id UUID;

    v_school_name TEXT;

    v_school_slug TEXT;

    v_branch_name TEXT;

BEGIN

    -- =====================================================
    -- STEP 1: VERIFY AUTHENTICATED USER
    -- =====================================================

    v_user_id := auth.uid();

    IF v_user_id IS NULL THEN

        RAISE EXCEPTION
            'Authentication is required to register a school.'
            USING ERRCODE = '28000';

    END IF;


    -- =====================================================
    -- STEP 2: VERIFY ACCOUNT CONFIRMATION
    -- =====================================================

    -- Users must have a confirmed email or phone.
    --
    -- This prevents an unverified account from
    -- immediately becoming a school proprietor.

    IF NOT EXISTS (

        SELECT 1

        FROM auth.users au

        WHERE au.id = v_user_id

        AND (

            au.email_confirmed_at IS NOT NULL

            OR

            au.phone_confirmed_at IS NOT NULL

        )

    ) THEN

        RAISE EXCEPTION
            'Please verify your email or phone before registering a school.';

    END IF;


    -- =====================================================
    -- STEP 3: NORMALIZE INPUT VALUES
    -- =====================================================

    v_school_name :=
        BTRIM(COALESCE(p_school_name, ''));

    v_school_slug :=
        LOWER(BTRIM(COALESCE(p_school_slug, '')));

    v_branch_name :=
        BTRIM(COALESCE(p_branch_name, ''));


    -- =====================================================
    -- STEP 4: VALIDATE SCHOOL NAME
    -- =====================================================

    IF LENGTH(v_school_name) NOT BETWEEN 2 AND 200 THEN

        RAISE EXCEPTION
            'School name must contain between 2 and 200 characters.';

    END IF;


    -- =====================================================
    -- STEP 5: VALIDATE SCHOOL SLUG
    -- =====================================================

    IF

        LENGTH(v_school_slug) NOT BETWEEN 3 AND 80

        OR

        v_school_slug !~ '^[a-z0-9]+(-[a-z0-9]+)*$'

    THEN

        RAISE EXCEPTION
            'School URL name must contain 3-80 lowercase letters, numbers or hyphens.';

    END IF;


    -- =====================================================
    -- STEP 6: VALIDATE MAIN BRANCH NAME
    -- =====================================================

    IF LENGTH(v_branch_name) NOT BETWEEN 2 AND 200 THEN

        RAISE EXCEPTION
            'Branch name must contain between 2 and 200 characters.';

    END IF;


    -- =====================================================
    -- STEP 7: CHECK EXISTING SCHOOL SLUG
    -- =====================================================

    SELECT s.id

    INTO v_existing_school_id

    FROM public.schools s

    WHERE s.slug = v_school_slug;


    IF v_existing_school_id IS NOT NULL THEN

        -- Allow a legitimate proprietor to retry
        -- registration of an existing school they
        -- already own.
        --
        -- This helps with repeated submissions
        -- after network interruptions.

        IF EXISTS (

            SELECT 1

            FROM public.school_memberships sm

            JOIN public.user_roles ur
                ON ur.membership_id = sm.id
                AND ur.school_id = sm.school_id

            JOIN public.roles r
                ON r.id = ur.role_id

            JOIN public.schools s
                ON s.id = sm.school_id

            WHERE sm.school_id = v_existing_school_id

              AND sm.user_id = v_user_id

              AND sm.status = 'active'

              AND s.status = 'active'

              AND r.code = 'proprietor'

        ) THEN

            RETURN v_existing_school_id;

        END IF;


        RAISE EXCEPTION
            'This school URL name is already taken.'
            USING ERRCODE = '23505';

    END IF;


    -- =====================================================
    -- STEP 8: VERIFY PROPRIETOR ROLE EXISTS
    -- =====================================================

    SELECT r.id

    INTO v_proprietor_role_id

    FROM public.roles r

    WHERE r.code = 'proprietor';


    IF v_proprietor_role_id IS NULL THEN

        RAISE EXCEPTION
            'School registration configuration is incomplete.';

    END IF;


    -- =====================================================
    -- STEP 9: ENSURE APPLICATION PROFILE EXISTS
    -- =====================================================

    -- CODE 009 normally creates this automatically.
    --
    -- This also handles an older authentication
    -- account whose application profile is missing.

    INSERT INTO public.users (

        id,
        created_by,
        updated_by

    )

    VALUES (

        v_user_id,
        v_user_id,
        v_user_id

    )

    ON CONFLICT (id)
    DO NOTHING;


    -- =====================================================
    -- STEP 10: CREATE SCHOOL
    -- =====================================================

    -- Schools are activated immediately during
    -- this initial self-service MVP.
    --
    -- A future school approval workflow can
    -- introduce a pending approval state.

    INSERT INTO public.schools (

        name,
        slug,
        status,
        created_by,
        updated_by

    )

    VALUES (

        v_school_name,
        v_school_slug,
        'active',
        v_user_id,
        v_user_id

    )

    RETURNING id INTO v_school_id;


    -- =====================================================
    -- STEP 11: CREATE MAIN BRANCH
    -- =====================================================

    INSERT INTO public.branches (

        school_id,
        name,
        code,
        is_main,
        is_active,
        created_by,
        updated_by

    )

    VALUES (

        v_school_id,
        v_branch_name,
        'MAIN',
        TRUE,
        TRUE,
        v_user_id,
        v_user_id

    )

    RETURNING id INTO v_branch_id;


    -- =====================================================
    -- STEP 12: CREATE SCHOOL SETTINGS
    -- =====================================================

    -- The database supplies:
    --
    -- timezone = Africa/Accra
    -- currency = GHS
    -- locale = en-GH

    INSERT INTO public.school_settings (

        school_id,
        created_by,
        updated_by

    )

    VALUES (

        v_school_id,
        v_user_id,
        v_user_id

    );


    -- =====================================================
    -- STEP 13: CREATE OWNER MEMBERSHIP
    -- =====================================================

    INSERT INTO public.school_memberships (

        school_id,
        user_id,
        status,
        joined_at,
        created_by,
        updated_by

    )

    VALUES (

        v_school_id,
        v_user_id,
        'active',
        NOW(),
        v_user_id,
        v_user_id

    )

    RETURNING id INTO v_membership_id;


    -- =====================================================
    -- STEP 14: ASSIGN PROPRIETOR ROLE
    -- =====================================================

    INSERT INTO public.user_roles (

        school_id,
        membership_id,
        role_id,
        created_by,
        updated_by

    )

    VALUES (

        v_school_id,
        v_membership_id,
        v_proprietor_role_id,
        v_user_id,
        v_user_id

    );


    -- =====================================================
    -- STEP 15: RETURN REGISTERED SCHOOL ID
    -- =====================================================

    RETURN v_school_id;

END;

$$;


-- =========================================================
-- SECTION 2: RESTRICT PRIVATE FUNCTION EXECUTION
-- =========================================================

REVOKE ALL ON FUNCTION

private.create_school_with_owner(
    TEXT,
    TEXT,
    TEXT
)

FROM PUBLIC, anon, authenticated;


-- Only authenticated users may invoke the
-- private implementation through its wrapper.
--
-- The private schema must remain excluded
-- from Supabase exposed API schemas.

GRANT EXECUTE ON FUNCTION

private.create_school_with_owner(
    TEXT,
    TEXT,
    TEXT
)

TO authenticated;


-- =========================================================
-- SECTION 3: CREATE PUBLIC REGISTRATION API
-- =========================================================

-- This is the function our Next.js application
-- will call through Supabase RPC.
--
-- SECURITY INVOKER means the public function
-- does not itself run with elevated privileges.
--
-- The private implementation performs all
-- authentication, validation and ownership checks.

CREATE FUNCTION public.register_school(

    p_school_name TEXT,

    p_school_slug TEXT,

    p_branch_name TEXT DEFAULT 'Main Campus'

)

RETURNS UUID

LANGUAGE SQL

VOLATILE

SECURITY INVOKER

SET search_path = ''

AS $$

    SELECT private.create_school_with_owner(

        p_school_name,
        p_school_slug,
        p_branch_name

    );

$$;


-- =========================================================
-- SECTION 4: RESTRICT PUBLIC API ACCESS
-- =========================================================

-- Functions may be executable by PUBLIC
-- unless permissions are explicitly revoked.

REVOKE ALL ON FUNCTION

public.register_school(
    TEXT,
    TEXT,
    TEXT
)

FROM PUBLIC, anon, authenticated;


-- Only signed-in users can register schools.

GRANT EXECUTE ON FUNCTION

public.register_school(
    TEXT,
    TEXT,
    TEXT
)

TO authenticated;


-- =========================================================
-- SECTION 5: FUNCTION DOCUMENTATION
-- =========================================================

COMMENT ON FUNCTION

public.register_school(
    TEXT,
    TEXT,
    TEXT
)

IS

'Registers a new school for the verified authenticated user. Creates the main branch, settings, active owner membership and proprietor role in one database transaction. Returns the new school UUID.';


COMMENT ON FUNCTION

private.create_school_with_owner(
    TEXT,
    TEXT,
    TEXT
)

IS

'Privileged school registration implementation. Uses auth.uid() for ownership and must remain outside exposed API schemas.';


-- =========================================================
-- SECTION 6: COMPLETE MIGRATION
-- =========================================================

COMMIT;


-- =========================================================
-- END OF CODE 010
-- =========================================================