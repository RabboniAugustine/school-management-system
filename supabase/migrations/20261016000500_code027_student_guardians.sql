-- CODE 027: Student guardian contact details, restricted to student readers/managers.
BEGIN;
CREATE TABLE public.student_guardians (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 school_id uuid NOT NULL REFERENCES public.schools(id) ON DELETE RESTRICT,
 student_id uuid NOT NULL,
 full_name text NOT NULL CHECK(char_length(btrim(full_name)) BETWEEN 2 AND 160),
 relationship text NOT NULL CHECK(relationship IN ('mother','father','guardian','other')),
 phone text NOT NULL CHECK(char_length(btrim(phone)) BETWEEN 7 AND 25),
 email text CHECK(email IS NULL OR char_length(btrim(email)) BETWEEN 3 AND 254),
 is_primary boolean NOT NULL DEFAULT false,
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now(),
 FOREIGN KEY(school_id,student_id) REFERENCES public.students(school_id,id) ON DELETE RESTRICT
);
CREATE INDEX student_guardians_student_idx ON public.student_guardians(school_id,student_id);
CREATE UNIQUE INDEX student_guardians_one_primary ON public.student_guardians(school_id,student_id)
 WHERE is_primary;
CREATE TRIGGER student_guardians_updated BEFORE UPDATE ON public.student_guardians
 FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
ALTER TABLE public.student_guardians ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.student_guardians FROM PUBLIC,anon,authenticated;
GRANT SELECT ON public.student_guardians TO authenticated;
GRANT INSERT(school_id,student_id,full_name,relationship,phone,email,is_primary)
 ON public.student_guardians TO authenticated;
GRANT UPDATE(full_name,relationship,phone,email,is_primary) ON public.student_guardians TO authenticated;
GRANT DELETE ON public.student_guardians TO authenticated;
CREATE POLICY guardians_select ON public.student_guardians FOR SELECT TO authenticated
 USING(private.has_school_permission(school_id,'students.read'));
CREATE POLICY guardians_insert ON public.student_guardians FOR INSERT TO authenticated
 WITH CHECK(private.has_school_permission(school_id,'students.manage'));
CREATE POLICY guardians_update ON public.student_guardians FOR UPDATE TO authenticated
 USING(private.has_school_permission(school_id,'students.manage'))
 WITH CHECK(private.has_school_permission(school_id,'students.manage'));
CREATE POLICY guardians_delete ON public.student_guardians FOR DELETE TO authenticated
 USING(private.has_school_permission(school_id,'students.manage'));
COMMIT;
