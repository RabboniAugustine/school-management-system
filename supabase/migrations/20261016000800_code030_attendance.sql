-- CODE 030: Attendance by enrollment, per calendar date.
BEGIN;
CREATE TABLE public.student_attendance (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 school_id uuid NOT NULL REFERENCES public.schools(id) ON DELETE RESTRICT,
 enrollment_id uuid NOT NULL,
 school_day date NOT NULL,
 status text NOT NULL CHECK(status IN ('present','absent','late','excused')),
 remarks text CHECK(remarks IS NULL OR char_length(remarks)<=500),
 marked_by uuid DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE SET NULL,
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(school_id,enrollment_id,school_day),
 FOREIGN KEY(school_id,enrollment_id) REFERENCES public.student_enrollments(school_id,id) ON DELETE RESTRICT
);
CREATE INDEX attendance_day_idx ON public.student_attendance(school_id,school_day);
CREATE INDEX attendance_enrollment_idx ON public.student_attendance(school_id,enrollment_id);
CREATE OR REPLACE FUNCTION private.validate_attendance_day()
RETURNS trigger LANGUAGE plpgsql SET search_path = '' AS $$
DECLARE v_from date; v_to date;
BEGIN
 SELECT ay.starts_on,ay.ends_on INTO v_from,v_to
 FROM public.student_enrollments se
 JOIN public.academic_years ay
   ON ay.id=se.academic_year_id AND ay.school_id=se.school_id
 WHERE se.id=NEW.enrollment_id AND se.school_id=NEW.school_id;
 IF NOT FOUND OR NEW.school_day<v_from OR NEW.school_day>v_to THEN
   RAISE EXCEPTION 'Attendance date must be within the enrolled academic year' USING ERRCODE='23514';
 END IF;
 RETURN NEW;
END; $$;
CREATE TRIGGER attendance_day_validate BEFORE INSERT OR UPDATE ON public.student_attendance
 FOR EACH ROW EXECUTE FUNCTION private.validate_attendance_day();
CREATE TRIGGER attendance_updated BEFORE UPDATE ON public.student_attendance
 FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
INSERT INTO public.permissions(code,name,description) VALUES
 ('attendance.read','View attendance','View school attendance records'),
 ('attendance.manage','Mark attendance','Record or correct daily attendance')
ON CONFLICT(code) DO NOTHING;
INSERT INTO public.role_permissions(role_id,permission_id)
SELECT r.id,p.id FROM (VALUES
 ('proprietor','attendance.read'),('proprietor','attendance.manage'),
 ('school_admin','attendance.read'),('school_admin','attendance.manage'),
 ('head_teacher','attendance.read'),('head_teacher','attendance.manage'),
 ('teacher','attendance.read'),('teacher','attendance.manage')
) v(role_code,permission_code)
JOIN public.roles r ON r.code=v.role_code JOIN public.permissions p ON p.code=v.permission_code
ON CONFLICT(role_id,permission_id) DO NOTHING;
ALTER TABLE public.student_attendance ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.student_attendance FROM PUBLIC,anon,authenticated;
GRANT SELECT ON public.student_attendance TO authenticated;
GRANT INSERT(school_id,enrollment_id,school_day,status,remarks) ON public.student_attendance TO authenticated;
GRANT UPDATE(status,remarks) ON public.student_attendance TO authenticated;
CREATE POLICY attendance_select ON public.student_attendance FOR SELECT TO authenticated
 USING(private.has_school_permission(school_id,'attendance.read'));
CREATE POLICY attendance_insert ON public.student_attendance FOR INSERT TO authenticated
 WITH CHECK(private.has_school_permission(school_id,'attendance.manage'));
CREATE POLICY attendance_update ON public.student_attendance FOR UPDATE TO authenticated
 USING(private.has_school_permission(school_id,'attendance.manage'))
 WITH CHECK(private.has_school_permission(school_id,'attendance.manage'));
COMMIT;
