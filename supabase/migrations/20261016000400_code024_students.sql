-- CODE 024: Student registration database.
BEGIN;
CREATE TABLE public.students (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 school_id uuid NOT NULL REFERENCES public.schools(id) ON DELETE RESTRICT,
 branch_id uuid NOT NULL,
 admission_number text NOT NULL CHECK (char_length(btrim(admission_number)) BETWEEN 2 AND 40),
 first_name text NOT NULL CHECK (char_length(btrim(first_name)) BETWEEN 1 AND 100),
 last_name text NOT NULL CHECK (char_length(btrim(last_name)) BETWEEN 1 AND 100),
 middle_name text CHECK (middle_name IS NULL OR char_length(btrim(middle_name)) BETWEEN 1 AND 100),
 date_of_birth date,
 gender text CHECK(gender IS NULL OR gender IN ('male','female','other','prefer_not_to_say')),
 admission_date date NOT NULL DEFAULT CURRENT_DATE,
 status text NOT NULL DEFAULT 'active'
   CHECK(status IN ('active','graduated','transferred','withdrawn')),
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(school_id,id), UNIQUE(school_id,admission_number),
 FOREIGN KEY(school_id,branch_id) REFERENCES public.branches(school_id,id) ON DELETE RESTRICT
);
CREATE INDEX students_branch_idx ON public.students(school_id,branch_id);
CREATE INDEX students_name_idx ON public.students(school_id,last_name,first_name);
CREATE TRIGGER students_updated BEFORE UPDATE ON public.students
 FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
INSERT INTO public.permissions(code,name,description) VALUES
 ('students.read','View students','View student directory and profiles'),
 ('students.manage','Manage students','Register and update student profiles')
ON CONFLICT(code) DO NOTHING;
INSERT INTO public.role_permissions(role_id,permission_id)
SELECT r.id,p.id FROM (VALUES
 ('proprietor','students.read'),('proprietor','students.manage'),
 ('school_admin','students.read'),('school_admin','students.manage'),
 ('head_teacher','students.read'),('head_teacher','students.manage'),
 ('teacher','students.read')
) v(role_code,permission_code)
JOIN public.roles r ON r.code=v.role_code JOIN public.permissions p ON p.code=v.permission_code
ON CONFLICT(role_id,permission_id) DO NOTHING;
ALTER TABLE public.students ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.students FROM PUBLIC,anon,authenticated;
GRANT SELECT ON public.students TO authenticated;
GRANT INSERT(school_id,branch_id,admission_number,first_name,last_name,middle_name,date_of_birth,gender,admission_date,status)
 ON public.students TO authenticated;
GRANT UPDATE(branch_id,admission_number,first_name,last_name,middle_name,date_of_birth,gender,admission_date,status)
 ON public.students TO authenticated;
CREATE POLICY students_select ON public.students FOR SELECT TO authenticated
 USING(private.has_school_permission(school_id,'students.read'));
CREATE POLICY students_insert ON public.students FOR INSERT TO authenticated
 WITH CHECK(private.has_school_permission(school_id,'students.manage'));
CREATE POLICY students_update ON public.students FOR UPDATE TO authenticated
 USING(private.has_school_permission(school_id,'students.manage'))
 WITH CHECK(private.has_school_permission(school_id,'students.manage'));
COMMIT;
