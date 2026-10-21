-- CODE 022: School classes and streams.
BEGIN;

-- =====================================================
-- FIX: COMPOSITE UNIQUE INDEX FOR SCHOOL BRANCHES
-- =====================================================

-- Required for foreign keys referencing
-- public.branches(school_id, id).

CREATE UNIQUE INDEX IF NOT EXISTS
branches_school_id_id_uidx
ON public.branches (school_id, id);

-- =====================================================
-- SCHOOL CLASSES
-- =====================================================

CREATE TABLE public.school_classes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id uuid NOT NULL REFERENCES public.schools(id) ON DELETE RESTRICT,
  branch_id uuid NOT NULL,
  name text NOT NULL CHECK (char_length(btrim(name)) BETWEEN 2 AND 100),
  code text NOT NULL CHECK (code ~ '^[A-Za-z0-9_-]{2,30}$'),
  level_order integer NOT NULL DEFAULT 1 CHECK (level_order BETWEEN 1 AND 99),
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (school_id, id),
  UNIQUE (school_id, branch_id, code),
  FOREIGN KEY (school_id,branch_id) REFERENCES public.branches(school_id,id) ON DELETE RESTRICT
);
CREATE TABLE public.class_streams (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id uuid NOT NULL REFERENCES public.schools(id) ON DELETE RESTRICT,
  class_id uuid NOT NULL,
  name text NOT NULL CHECK (char_length(btrim(name)) BETWEEN 1 AND 80),
  code text NOT NULL CHECK (code ~ '^[A-Za-z0-9_-]{1,30}$'),
  capacity integer CHECK (capacity BETWEEN 1 AND 1000),
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (school_id, id),
  UNIQUE (school_id, class_id, id),
  UNIQUE (school_id, class_id, code),
  FOREIGN KEY (school_id,class_id) REFERENCES public.school_classes(school_id,id) ON DELETE RESTRICT
);
CREATE INDEX school_classes_branch_idx ON public.school_classes(school_id,branch_id);
CREATE INDEX class_streams_class_idx ON public.class_streams(school_id,class_id);
CREATE TRIGGER school_classes_updated BEFORE UPDATE ON public.school_classes
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER class_streams_updated BEFORE UPDATE ON public.class_streams
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
INSERT INTO public.permissions(code,name,description) VALUES
  ('classes.read','View classes','View school classes and streams'),
  ('classes.manage','Manage classes','Create and edit school classes and streams')
ON CONFLICT (code) DO NOTHING;
INSERT INTO public.role_permissions(role_id,permission_id)
SELECT r.id,p.id FROM (VALUES
 ('proprietor','classes.read'),('proprietor','classes.manage'),
 ('school_admin','classes.read'),('school_admin','classes.manage'),
 ('head_teacher','classes.read'),('head_teacher','classes.manage'),
 ('teacher','classes.read'),('bursar','classes.read'),('librarian','classes.read')
) v(role_code,permission_code)
JOIN public.roles r ON r.code=v.role_code JOIN public.permissions p ON p.code=v.permission_code
ON CONFLICT (role_id,permission_id) DO NOTHING;
ALTER TABLE public.school_classes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.class_streams ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.school_classes,public.class_streams FROM PUBLIC,anon,authenticated;
GRANT SELECT ON public.school_classes,public.class_streams TO authenticated;
GRANT INSERT(school_id,branch_id,name,code,level_order,is_active) ON public.school_classes TO authenticated;
GRANT UPDATE(name,code,level_order,is_active) ON public.school_classes TO authenticated;
GRANT INSERT(school_id,class_id,name,code,capacity,is_active) ON public.class_streams TO authenticated;
GRANT UPDATE(name,code,capacity,is_active) ON public.class_streams TO authenticated;
CREATE POLICY classes_select ON public.school_classes FOR SELECT TO authenticated
  USING (private.has_school_permission(school_id,'classes.read'));
CREATE POLICY classes_insert ON public.school_classes FOR INSERT TO authenticated
  WITH CHECK (private.has_school_permission(school_id,'classes.manage'));
CREATE POLICY classes_update ON public.school_classes FOR UPDATE TO authenticated
  USING (private.has_school_permission(school_id,'classes.manage'))
  WITH CHECK (private.has_school_permission(school_id,'classes.manage'));
CREATE POLICY streams_select ON public.class_streams FOR SELECT TO authenticated
  USING (private.has_school_permission(school_id,'classes.read'));
CREATE POLICY streams_insert ON public.class_streams FOR INSERT TO authenticated
  WITH CHECK (private.has_school_permission(school_id,'classes.manage'));
CREATE POLICY streams_update ON public.class_streams FOR UPDATE TO authenticated
  USING (private.has_school_permission(school_id,'classes.manage'))
  WITH CHECK (private.has_school_permission(school_id,'classes.manage'));
COMMIT;
