-- CODE 028: Staff and teacher profiles.
BEGIN;
CREATE TABLE public.staff_members (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 school_id uuid NOT NULL REFERENCES public.schools(id) ON DELETE RESTRICT,
 branch_id uuid NOT NULL,
 user_id uuid REFERENCES public.users(id) ON DELETE SET NULL,
 employee_number text NOT NULL CHECK(char_length(btrim(employee_number)) BETWEEN 2 AND 40),
 first_name text NOT NULL CHECK(char_length(btrim(first_name)) BETWEEN 1 AND 100),
 last_name text NOT NULL CHECK(char_length(btrim(last_name)) BETWEEN 1 AND 100),
 job_title text NOT NULL CHECK(char_length(btrim(job_title)) BETWEEN 2 AND 120),
 email text,
 phone text,
 hired_on date,
 status text NOT NULL DEFAULT 'active' CHECK(status IN ('active','on_leave','inactive')),
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(school_id,id),UNIQUE(school_id,employee_number),
 FOREIGN KEY(school_id,branch_id) REFERENCES public.branches(school_id,id) ON DELETE RESTRICT
);
CREATE UNIQUE INDEX staff_one_user_per_school ON public.staff_members(school_id,user_id)
 WHERE user_id IS NOT NULL;
CREATE INDEX staff_members_name_idx ON public.staff_members(school_id,last_name,first_name);
CREATE TRIGGER staff_members_updated BEFORE UPDATE ON public.staff_members
 FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
INSERT INTO public.permissions(code,name,description) VALUES
 ('staff.read','View staff','View school staff directory'),
 ('staff.manage','Manage staff','Add and update staff records')
ON CONFLICT(code) DO NOTHING;
INSERT INTO public.role_permissions(role_id,permission_id)
SELECT r.id,p.id FROM (VALUES
 ('proprietor','staff.read'),('proprietor','staff.manage'),
 ('school_admin','staff.read'),('school_admin','staff.manage'),
 ('head_teacher','staff.read'),('head_teacher','staff.manage')
) v(role_code,permission_code)
JOIN public.roles r ON r.code=v.role_code JOIN public.permissions p ON p.code=v.permission_code
ON CONFLICT(role_id,permission_id) DO NOTHING;
ALTER TABLE public.staff_members ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.staff_members FROM PUBLIC,anon,authenticated;
GRANT SELECT ON public.staff_members TO authenticated;
GRANT INSERT(school_id,branch_id,employee_number,first_name,last_name,job_title,email,phone,hired_on,status)
 ON public.staff_members TO authenticated;
GRANT UPDATE(branch_id,employee_number,first_name,last_name,job_title,email,phone,hired_on,status)
 ON public.staff_members TO authenticated;
CREATE POLICY staff_select ON public.staff_members FOR SELECT TO authenticated
 USING(private.has_school_permission(school_id,'staff.read'));
CREATE POLICY staff_insert ON public.staff_members FOR INSERT TO authenticated
 WITH CHECK(private.has_school_permission(school_id,'staff.manage'));
CREATE POLICY staff_update ON public.staff_members FOR UPDATE TO authenticated
 USING(private.has_school_permission(school_id,'staff.manage'))
 WITH CHECK(private.has_school_permission(school_id,'staff.manage'));
COMMIT;
