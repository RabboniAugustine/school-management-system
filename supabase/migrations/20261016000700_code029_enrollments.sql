-- CODE 029: School-scoped student enrollment in academic year, class, and stream.
BEGIN;
CREATE TABLE public.student_enrollments (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 school_id uuid NOT NULL REFERENCES public.schools(id) ON DELETE RESTRICT,
 student_id uuid NOT NULL,
 academic_year_id uuid NOT NULL,
 class_id uuid NOT NULL,
 stream_id uuid,
 enrolled_on date NOT NULL DEFAULT CURRENT_DATE,
 status text NOT NULL DEFAULT 'active' CHECK(status IN ('active','completed','transferred')),
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(school_id,id),
 UNIQUE(school_id,student_id,academic_year_id),
 FOREIGN KEY(school_id,student_id) REFERENCES public.students(school_id,id) ON DELETE RESTRICT,
 FOREIGN KEY(school_id,academic_year_id) REFERENCES public.academic_years(school_id,id) ON DELETE RESTRICT,
 FOREIGN KEY(school_id,class_id) REFERENCES public.school_classes(school_id,id) ON DELETE RESTRICT,
 FOREIGN KEY(school_id,class_id,stream_id) REFERENCES public.class_streams(school_id,class_id,id) ON DELETE RESTRICT
);
CREATE INDEX enrollments_class_idx ON public.student_enrollments(school_id,class_id,academic_year_id);
CREATE INDEX enrollments_student_idx ON public.student_enrollments(school_id,student_id);
CREATE OR REPLACE FUNCTION private.validate_student_enrollment()
RETURNS trigger LANGUAGE plpgsql SET search_path = '' AS $$
DECLARE v_student_branch uuid; v_class_branch uuid;
BEGIN
 SELECT s.branch_id INTO v_student_branch FROM public.students s
 WHERE s.id=NEW.student_id AND s.school_id=NEW.school_id AND s.status='active';
 IF NOT FOUND THEN RAISE EXCEPTION 'Student is not active in this school' USING ERRCODE='23514'; END IF;
 SELECT c.branch_id INTO v_class_branch FROM public.school_classes c
 WHERE c.id=NEW.class_id AND c.school_id=NEW.school_id AND c.is_active;
 IF NOT FOUND THEN RAISE EXCEPTION 'Class unavailable' USING ERRCODE='23514'; END IF;
 IF v_student_branch<>v_class_branch THEN
   RAISE EXCEPTION 'Student and class must belong to same branch' USING ERRCODE='23514';
 END IF;
 IF NEW.stream_id IS NOT NULL AND NOT EXISTS (
   SELECT 1 FROM public.class_streams cs
   WHERE cs.id=NEW.stream_id AND cs.school_id=NEW.school_id
     AND cs.class_id=NEW.class_id AND cs.is_active
 ) THEN RAISE EXCEPTION 'Stream unavailable' USING ERRCODE='23514'; END IF;
 RETURN NEW;
END; $$;
CREATE TRIGGER student_enrollment_validate BEFORE INSERT OR UPDATE OF school_id,student_id,class_id,stream_id ON public.student_enrollments
 FOR EACH ROW EXECUTE FUNCTION private.validate_student_enrollment();
CREATE TRIGGER student_enrollments_updated BEFORE UPDATE ON public.student_enrollments
 FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
INSERT INTO public.permissions(code,name,description) VALUES
 ('enrollments.read','View enrollments','View student class enrollment records'),
 ('enrollments.manage','Manage enrollments','Assign students to classes and streams')
ON CONFLICT(code) DO NOTHING;
INSERT INTO public.role_permissions(role_id,permission_id)
SELECT r.id,p.id FROM (VALUES
 ('proprietor','enrollments.read'),('proprietor','enrollments.manage'),
 ('school_admin','enrollments.read'),('school_admin','enrollments.manage'),
 ('head_teacher','enrollments.read'),('head_teacher','enrollments.manage'),
 ('teacher','enrollments.read')
) v(role_code,permission_code)
JOIN public.roles r ON r.code=v.role_code JOIN public.permissions p ON p.code=v.permission_code
ON CONFLICT(role_id,permission_id) DO NOTHING;
ALTER TABLE public.student_enrollments ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.student_enrollments FROM PUBLIC,anon,authenticated;
GRANT SELECT ON public.student_enrollments TO authenticated;
GRANT INSERT(school_id,student_id,academic_year_id,class_id,stream_id,enrolled_on,status)
 ON public.student_enrollments TO authenticated;
GRANT UPDATE(class_id,stream_id,status,enrolled_on) ON public.student_enrollments TO authenticated;
CREATE POLICY enrollment_select ON public.student_enrollments FOR SELECT TO authenticated
 USING(private.has_school_permission(school_id,'enrollments.read'));
CREATE POLICY enrollment_insert ON public.student_enrollments FOR INSERT TO authenticated
 WITH CHECK(private.has_school_permission(school_id,'enrollments.manage'));
CREATE POLICY enrollment_update ON public.student_enrollments FOR UPDATE TO authenticated
 USING(private.has_school_permission(school_id,'enrollments.manage'))
 WITH CHECK(private.has_school_permission(school_id,'enrollments.manage'));
COMMIT;
