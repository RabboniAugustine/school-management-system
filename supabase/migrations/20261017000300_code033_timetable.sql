-- CODE 033: Timetable periods and weekly class slots with teacher/room clash prevention.
BEGIN;
CREATE TABLE public.timetable_periods (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 school_id uuid NOT NULL REFERENCES public.schools(id) ON DELETE RESTRICT,
 name text NOT NULL CHECK(char_length(btrim(name)) BETWEEN 1 AND 60),
 starts_at time NOT NULL,
 ends_at time NOT NULL,
 sort_order smallint NOT NULL CHECK(sort_order BETWEEN 1 AND 30),
 is_break boolean NOT NULL DEFAULT false,
 created_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(school_id,id), UNIQUE(school_id,sort_order), CHECK(ends_at > starts_at)
);
CREATE TABLE public.timetable_slots (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 school_id uuid NOT NULL REFERENCES public.schools(id) ON DELETE RESTRICT,
 academic_year_id uuid NOT NULL,
 class_id uuid NOT NULL,
 subject_id uuid NOT NULL,
 staff_id uuid,
 period_id uuid NOT NULL,
 day_of_week smallint NOT NULL CHECK(day_of_week BETWEEN 1 AND 7),
 room text CHECK(room IS NULL OR char_length(btrim(room)) BETWEEN 1 AND 40),
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(school_id,academic_year_id,class_id,day_of_week,period_id),
 FOREIGN KEY(school_id,academic_year_id) REFERENCES public.academic_years(school_id,id) ON DELETE RESTRICT,
 FOREIGN KEY(school_id,class_id,subject_id) REFERENCES public.class_subjects(school_id,class_id,subject_id) ON DELETE RESTRICT,
 FOREIGN KEY(school_id,staff_id) REFERENCES public.staff_members(school_id,id) ON DELETE RESTRICT,
 FOREIGN KEY(school_id,period_id) REFERENCES public.timetable_periods(school_id,id) ON DELETE RESTRICT
);
-- A teacher can only be in one place per period; a room can only host one class per period.
CREATE UNIQUE INDEX timetable_teacher_clash ON public.timetable_slots(school_id,academic_year_id,staff_id,day_of_week,period_id) WHERE staff_id IS NOT NULL;
CREATE UNIQUE INDEX timetable_room_clash ON public.timetable_slots(school_id,academic_year_id,lower(room),day_of_week,period_id) WHERE room IS NOT NULL;
CREATE INDEX timetable_class_idx ON public.timetable_slots(school_id,academic_year_id,class_id);
CREATE TRIGGER timetable_slots_updated BEFORE UPDATE ON public.timetable_slots FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

INSERT INTO public.permissions(code,name,description) VALUES
 ('timetable.read','View timetable','View class and teacher timetables'),
 ('timetable.manage','Manage timetable','Define periods and schedule lessons')
ON CONFLICT(code) DO NOTHING;
INSERT INTO public.role_permissions(role_id,permission_id)
SELECT r.id,p.id FROM (VALUES
 ('proprietor','timetable.read'),('proprietor','timetable.manage'),
 ('school_admin','timetable.read'),('school_admin','timetable.manage'),
 ('head_teacher','timetable.read'),('head_teacher','timetable.manage'),
 ('teacher','timetable.read')
) v(role_code,permission_code)
JOIN public.roles r ON r.code=v.role_code JOIN public.permissions p ON p.code=v.permission_code
ON CONFLICT(role_id,permission_id) DO NOTHING;

ALTER TABLE public.timetable_periods ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.timetable_slots ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.timetable_periods,public.timetable_slots FROM PUBLIC,anon,authenticated;
GRANT SELECT ON public.timetable_periods,public.timetable_slots TO authenticated;
GRANT INSERT(school_id,name,starts_at,ends_at,sort_order,is_break) ON public.timetable_periods TO authenticated;
GRANT UPDATE(name,starts_at,ends_at,is_break) ON public.timetable_periods TO authenticated;
GRANT INSERT(school_id,academic_year_id,class_id,subject_id,staff_id,period_id,day_of_week,room) ON public.timetable_slots TO authenticated;
GRANT UPDATE(subject_id,staff_id,room) ON public.timetable_slots TO authenticated;
GRANT DELETE ON public.timetable_slots TO authenticated;
CREATE POLICY periods_select ON public.timetable_periods FOR SELECT TO authenticated USING(private.has_school_permission(school_id,'timetable.read'));
CREATE POLICY periods_insert ON public.timetable_periods FOR INSERT TO authenticated WITH CHECK(private.has_school_permission(school_id,'timetable.manage'));
CREATE POLICY periods_update ON public.timetable_periods FOR UPDATE TO authenticated USING(private.has_school_permission(school_id,'timetable.manage')) WITH CHECK(private.has_school_permission(school_id,'timetable.manage'));
CREATE POLICY slots_select ON public.timetable_slots FOR SELECT TO authenticated USING(private.has_school_permission(school_id,'timetable.read'));
CREATE POLICY slots_insert ON public.timetable_slots FOR INSERT TO authenticated WITH CHECK(private.has_school_permission(school_id,'timetable.manage'));
CREATE POLICY slots_update ON public.timetable_slots FOR UPDATE TO authenticated USING(private.has_school_permission(school_id,'timetable.manage')) WITH CHECK(private.has_school_permission(school_id,'timetable.manage'));
CREATE POLICY slots_delete ON public.timetable_slots FOR DELETE TO authenticated USING(private.has_school_permission(school_id,'timetable.manage'));
COMMIT;
