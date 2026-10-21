-- =========================================================
-- SCHOOL MANAGEMENT SYSTEM
-- =========================================================
--
-- CODE: 009
-- MODULE: AUTOMATIC USER PROFILE PROVISIONING
-- DATABASE: PostgreSQL / Supabase
-- VERSION: 1.0.0
--
-- DESCRIPTION:
--
-- Automatically creates an application user profile
-- whenever a new authentication user is created.
--
-- FEATURES:
--
-- 1. Automatic user profile creation
-- 2. Secure database trigger
-- 3. Duplicate profile prevention
-- 4. Existing authentication user synchronization
-- 5. Compatibility with multi-school architecture
--
-- DEPENDENCIES:
--
-- CODE 005 - School Foundation
-- CODE 006 - Users and Memberships
-- CODE 007 - Permissions and RLS
--
-- SECURITY:
--
-- Creating a profile DOES NOT grant school access.
--
-- School memberships and role assignments
-- must be created through an authorized process.
--
-- =========================================================


BEGIN;


-- =========================================================
-- SECTION 1: AUTOMATIC PROFILE CREATION FUNCTION
-- =========================================================

-- This function runs whenever Supabase
-- creates a new authentication account.
--
-- SECURITY DEFINER allows the function to
-- insert the profile using the privileges
-- of the function owner.
--
-- The function must be owned by the trusted
-- migration role, normally postgres.
--
-- An empty search_path reduces the risk
-- of malicious object-name resolution.


CREATE OR REPLACE FUNCTION private.handle_new_auth_user()

RETURNS TRIGGER

LANGUAGE plpgsql

SECURITY DEFINER

SET search_path = ''

AS $$

BEGIN

    -- -----------------------------------------------------
    -- Create the corresponding application profile.
    -- -----------------------------------------------------

    INSERT INTO public.users (

        id

    )

    VALUES (

        NEW.id

    )

    -- -----------------------------------------------------
    -- Prevent duplicate profiles.
    -- -----------------------------------------------------

    ON CONFLICT (id)
    DO NOTHING;


    -- -----------------------------------------------------
    -- Return the newly created authentication record.
    -- -----------------------------------------------------

    RETURN NEW;

END;

$$;


-- =========================================================
-- SECTION 2: RESTRICT FUNCTION EXECUTION
-- =========================================================

-- This function is intended to run through
-- its database trigger.
--
-- Browser users must not be able to invoke
-- the privileged function directly.


REVOKE ALL ON FUNCTION
private.handle_new_auth_user()

FROM PUBLIC, anon, authenticated;


-- =========================================================
-- SECTION 3: CREATE AUTHENTICATION TRIGGER
-- =========================================================

-- Automatically execute the provisioning
-- function after a new user is inserted
-- into Supabase Authentication.
--
-- The trigger runs inside the same database
-- transaction as the authentication insert.


CREATE TRIGGER trg_auth_user_profile_created

AFTER INSERT

ON auth.users

FOR EACH ROW

EXECUTE FUNCTION private.handle_new_auth_user();


-- =========================================================
-- SECTION 4: SYNCHRONIZE EXISTING AUTH USERS
-- =========================================================

-- Some authentication users may have been
-- created before this migration.
--
-- This operation creates any missing profiles
-- without modifying existing profile records.


INSERT INTO public.users (

    id

)

SELECT

    au.id

FROM auth.users AS au

ON CONFLICT (id)
DO NOTHING;


-- =========================================================
-- SECTION 5: COMPLETE MIGRATION
-- =========================================================

COMMIT;


-- =========================================================
-- END OF CODE 009
-- =========================================================