-- CODE 023: School subjects and class-subject assignments.
BEGIN;
CREATE TABLE public.school_subjects (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id uuid NOT NULL REFERENCES public.schools(id) ON DELETE RESTRICT,
  code text NOT NULL CHECK (code ~ '^[A-Za-z0-9_-]{2,30}$'),
  name text NOT NULL CHECK (char_length(btrim(name)) BETWEEN 2 AND 120),
  is_core boolean NOT NULL DEFAULT true,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(school_id,id), UNIQUE(school_id,code)
);
CREATE TABLE public.class_subjects (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id uuid NOT NULL REFERENCES public.schools(id) ON DELETE RESTRICT,
  class_id uuid NOT NULL,
  subject_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(school_id,class_id,subject_id),
  FOREIGN KEY(school_id,class_id) REFERENCES public.school_classes(school_id,id) ON DELETE RESTRICT,
  FOREIGN KEY(school_id,subject_id) REFERENCES public.school_subjects(school_id,id) ON DELETE RESTRICT
);
CREATE INDEX school_subjects_school_idx ON public.school_subjects(school_id);
CREATE INDEX class_subjects_class_idx ON public.class_subjects(school_id,class_id);
CREATE TRIGGER school_subjects_updated BEFORE UPDATE ON public.school_subjects
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
INSERT INTO public.permissions(code,name,description) VALUES
 ('subjects.read','View subjects','View subjects and class assignments'),
 ('subjects.manage','Manage subjects','Maintain subjects and class assignments')
ON CONFLICT(code) DO NOTHING;
INSERT INTO public.role_permissions(role_id,permission_id)
SELECT r.id,p.id FROM (VALUES
 ('proprietor','subjects.read'),('proprietor','subjects.manage'),
 ('school_admin','subjects.read'),('school_admin','subjects.manage'),
 ('head_teacher','subjects.read'),('head_teacher','subjects.manage'),
 ('teacher','subjects.read')
) v(role_code,permission_code)
JOIN public.roles r ON r.code=v.role_code JOIN public.permissions p ON p.code=v.permission_code
ON CONFLICT(role_id,permission_id) DO NOTHING;
ALTER TABLE public.school_subjects ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.class_subjects ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.school_subjects,public.class_subjects FROM PUBLIC,anon,authenticated;
GRANT SELECT ON public.school_subjects,public.class_subjects TO authenticated;
GRANT INSERT(school_id,code,name,is_core,is_active) ON public.school_subjects TO authenticated;
GRANT UPDATE(code,name,is_core,is_active) ON public.school_subjects TO authenticated;
GRANT INSERT(school_id,class_id,subject_id) ON public.class_subjects TO authenticated;
GRANT DELETE ON public.class_subjects TO authenticated;
CREATE POLICY subjects_select ON public.school_subjects FOR SELECT TO authenticated
 USING(private.has_school_permission(school_id,'subjects.read'));
CREATE POLICY subjects_insert ON public.school_subjects FOR INSERT TO authenticated
 WITH CHECK(private.has_school_permission(school_id,'subjects.manage'));
CREATE POLICY subjects_update ON public.school_subjects FOR UPDATE TO authenticated
 USING(private.has_school_permission(school_id,'subjects.manage'))
 WITH CHECK(private.has_school_permission(school_id,'subjects.manage'));
CREATE POLICY class_subjects_select ON public.class_subjects FOR SELECT TO authenticated
 USING(private.has_school_permission(school_id,'subjects.read'));
CREATE POLICY class_subjects_insert ON public.class_subjects FOR INSERT TO authenticated
 WITH CHECK(private.has_school_permission(school_id,'subjects.manage'));
CREATE POLICY class_subjects_delete ON public.class_subjects FOR DELETE TO authenticated
 USING(private.has_school_permission(school_id,'subjects.manage'));
COMMIT;
