-- CODE 032: Assessments, scores, grading scales, report-card remarks and ranked term results.
BEGIN;

CREATE TABLE public.grading_scales (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 school_id uuid NOT NULL REFERENCES public.schools(id) ON DELETE RESTRICT,
 grade text NOT NULL CHECK(char_length(btrim(grade)) BETWEEN 1 AND 6),
 min_score numeric(5,2) NOT NULL CHECK(min_score BETWEEN 0 AND 100),
 max_score numeric(5,2) NOT NULL CHECK(max_score BETWEEN 0 AND 100),
 remark text NOT NULL CHECK(char_length(btrim(remark)) BETWEEN 2 AND 60),
 created_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(school_id,grade), CHECK(min_score <= max_score)
);
CREATE INDEX grading_scales_school_idx ON public.grading_scales(school_id,min_score);

-- Overlapping bands would make a score map to two grades, so they are rejected.
CREATE OR REPLACE FUNCTION private.validate_grading_band()
RETURNS trigger LANGUAGE plpgsql SET search_path = '' AS $$
BEGIN
 IF EXISTS (SELECT 1 FROM public.grading_scales g WHERE g.school_id=NEW.school_id AND g.id<>NEW.id
   AND NEW.min_score <= g.max_score AND NEW.max_score >= g.min_score) THEN
  RAISE EXCEPTION 'Grade band overlaps an existing band' USING ERRCODE='23514';
 END IF;
 RETURN NEW;
END; $$;
CREATE TRIGGER grading_band_validate BEFORE INSERT OR UPDATE ON public.grading_scales FOR EACH ROW EXECUTE FUNCTION private.validate_grading_band();

CREATE TABLE public.assessments (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 school_id uuid NOT NULL REFERENCES public.schools(id) ON DELETE RESTRICT,
 term_id uuid NOT NULL,
 class_id uuid NOT NULL,
 subject_id uuid NOT NULL,
 name text NOT NULL CHECK(char_length(btrim(name)) BETWEEN 2 AND 120),
 kind text NOT NULL DEFAULT 'class_test' CHECK(kind IN ('class_test','assignment','project','mid_term','exam')),
 max_score numeric(6,2) NOT NULL CHECK(max_score > 0 AND max_score <= 1000),
 weight_percent numeric(5,2) NOT NULL CHECK(weight_percent > 0 AND weight_percent <= 100),
 assessed_on date,
 is_locked boolean NOT NULL DEFAULT false,
 created_by uuid DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE SET NULL,
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(school_id,id),
 UNIQUE(school_id,term_id,class_id,subject_id,name),
 FOREIGN KEY(school_id,term_id) REFERENCES public.terms(school_id,id) ON DELETE RESTRICT,
 FOREIGN KEY(school_id,class_id,subject_id) REFERENCES public.class_subjects(school_id,class_id,subject_id) ON DELETE RESTRICT
);
CREATE INDEX assessments_scope_idx ON public.assessments(school_id,term_id,class_id,subject_id);

-- Weights for one subject in one term must never add up to more than 100%.
CREATE OR REPLACE FUNCTION private.validate_assessment_weight()
RETURNS trigger LANGUAGE plpgsql SET search_path = '' AS $$
DECLARE v_sum numeric;
BEGIN
 SELECT COALESCE(SUM(a.weight_percent),0) INTO v_sum FROM public.assessments a
 WHERE a.school_id=NEW.school_id AND a.term_id=NEW.term_id AND a.class_id=NEW.class_id AND a.subject_id=NEW.subject_id AND a.id<>NEW.id;
 IF v_sum + NEW.weight_percent > 100 THEN
  RAISE EXCEPTION 'Assessment weights for this subject and term exceed 100%%' USING ERRCODE='23514';
 END IF;
 RETURN NEW;
END; $$;
CREATE TRIGGER assessments_weight_validate BEFORE INSERT OR UPDATE OF weight_percent ON public.assessments FOR EACH ROW EXECUTE FUNCTION private.validate_assessment_weight();
CREATE TRIGGER assessments_updated BEFORE UPDATE ON public.assessments FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE public.scores (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 school_id uuid NOT NULL REFERENCES public.schools(id) ON DELETE RESTRICT,
 assessment_id uuid NOT NULL,
 enrollment_id uuid NOT NULL,
 score numeric(6,2) NOT NULL CHECK(score >= 0),
 entered_by uuid DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE SET NULL,
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(school_id,assessment_id,enrollment_id),
 FOREIGN KEY(school_id,assessment_id) REFERENCES public.assessments(school_id,id) ON DELETE RESTRICT,
 FOREIGN KEY(school_id,enrollment_id) REFERENCES public.student_enrollments(school_id,id) ON DELETE RESTRICT
);
CREATE INDEX scores_enrollment_idx ON public.scores(school_id,enrollment_id);

CREATE OR REPLACE FUNCTION private.validate_score()
RETURNS trigger LANGUAGE plpgsql SET search_path = '' AS $$
DECLARE v_max numeric; v_class uuid; v_locked boolean; v_enroll_class uuid;
BEGIN
 SELECT max_score,class_id,is_locked INTO v_max,v_class,v_locked FROM public.assessments WHERE id=NEW.assessment_id AND school_id=NEW.school_id;
 IF v_locked THEN RAISE EXCEPTION 'Assessment is locked' USING ERRCODE='23514'; END IF;
 IF NEW.score > v_max THEN RAISE EXCEPTION 'Score exceeds the maximum of %', v_max USING ERRCODE='23514'; END IF;
 SELECT class_id INTO v_enroll_class FROM public.student_enrollments WHERE id=NEW.enrollment_id AND school_id=NEW.school_id;
 IF v_enroll_class IS DISTINCT FROM v_class THEN RAISE EXCEPTION 'Student is not enrolled in this class' USING ERRCODE='23514'; END IF;
 RETURN NEW;
END; $$;
CREATE TRIGGER scores_validate BEFORE INSERT OR UPDATE ON public.scores FOR EACH ROW EXECUTE FUNCTION private.validate_score();
CREATE TRIGGER scores_updated BEFORE UPDATE ON public.scores FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE public.report_remarks (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 school_id uuid NOT NULL REFERENCES public.schools(id) ON DELETE RESTRICT,
 enrollment_id uuid NOT NULL,
 term_id uuid NOT NULL,
 teacher_remark text CHECK(teacher_remark IS NULL OR char_length(teacher_remark)<=400),
 head_remark text CHECK(head_remark IS NULL OR char_length(head_remark)<=400),
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(school_id,enrollment_id,term_id),
 FOREIGN KEY(school_id,enrollment_id) REFERENCES public.student_enrollments(school_id,id) ON DELETE RESTRICT,
 FOREIGN KEY(school_id,term_id) REFERENCES public.terms(school_id,id) ON DELETE RESTRICT
);
CREATE TRIGGER report_remarks_updated BEFORE UPDATE ON public.report_remarks FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Weighted subject result per student/term/subject, with grade lookup.
CREATE VIEW public.subject_results WITH (security_invoker = true) AS
SELECT a.school_id,a.term_id,a.class_id,a.subject_id,s.enrollment_id,
 ROUND(SUM(s.score / a.max_score * a.weight_percent),2) AS total_percent,
 SUM(a.weight_percent) AS weight_counted,
 (SELECT g.grade FROM public.grading_scales g WHERE g.school_id=a.school_id
   AND ROUND(SUM(s.score / a.max_score * a.weight_percent),2) BETWEEN g.min_score AND g.max_score LIMIT 1) AS grade,
 (SELECT g.remark FROM public.grading_scales g WHERE g.school_id=a.school_id
   AND ROUND(SUM(s.score / a.max_score * a.weight_percent),2) BETWEEN g.min_score AND g.max_score LIMIT 1) AS grade_remark
FROM public.assessments a JOIN public.scores s ON s.assessment_id=a.id AND s.school_id=a.school_id
GROUP BY a.school_id,a.term_id,a.class_id,a.subject_id,s.enrollment_id;

-- Overall average and class position per term.
CREATE VIEW public.term_rankings WITH (security_invoker = true) AS
SELECT r.school_id,r.term_id,r.class_id,r.enrollment_id,
 ROUND(AVG(r.total_percent),2) AS average_percent,
 COUNT(*)::int AS subjects_counted,
 RANK() OVER (PARTITION BY r.school_id,r.term_id,r.class_id ORDER BY AVG(r.total_percent) DESC)::int AS position,
 COUNT(*) OVER (PARTITION BY r.school_id,r.term_id,r.class_id)::int AS class_size
FROM public.subject_results r
GROUP BY r.school_id,r.term_id,r.class_id,r.enrollment_id;

CREATE OR REPLACE FUNCTION public.load_default_grading_scale(p_school_id uuid)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_n integer;
BEGIN
 IF NOT private.has_school_permission(p_school_id,'grades.manage') THEN RAISE EXCEPTION 'Not allowed' USING ERRCODE='42501'; END IF;
 IF EXISTS (SELECT 1 FROM public.grading_scales WHERE school_id=p_school_id) THEN
  RAISE EXCEPTION 'A grading scale already exists' USING ERRCODE='23505';
 END IF;
 INSERT INTO public.grading_scales(school_id,grade,min_score,max_score,remark) VALUES
  (p_school_id,'A1',80,100,'Excellent'),(p_school_id,'B2',70,79.99,'Very Good'),(p_school_id,'B3',65,69.99,'Good'),
  (p_school_id,'C4',60,64.99,'Credit'),(p_school_id,'C5',55,59.99,'Credit'),(p_school_id,'C6',50,54.99,'Credit'),
  (p_school_id,'D7',45,49.99,'Pass'),(p_school_id,'E8',40,44.99,'Pass'),(p_school_id,'F9',0,39.99,'Fail');
 GET DIAGNOSTICS v_n = ROW_COUNT;
 RETURN v_n;
END; $$;
REVOKE ALL ON FUNCTION public.load_default_grading_scale(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.load_default_grading_scale(uuid) TO authenticated;

INSERT INTO public.permissions(code,name,description) VALUES
 ('grades.read','View grades','View assessments, scores and report cards'),
 ('grades.manage','Manage grades','Create assessments, enter scores and write report remarks')
ON CONFLICT(code) DO NOTHING;
INSERT INTO public.role_permissions(role_id,permission_id)
SELECT r.id,p.id FROM (VALUES
 ('proprietor','grades.read'),('proprietor','grades.manage'),
 ('school_admin','grades.read'),('school_admin','grades.manage'),
 ('head_teacher','grades.read'),('head_teacher','grades.manage'),
 ('teacher','grades.read'),('teacher','grades.manage')
) v(role_code,permission_code)
JOIN public.roles r ON r.code=v.role_code JOIN public.permissions p ON p.code=v.permission_code
ON CONFLICT(role_id,permission_id) DO NOTHING;

ALTER TABLE public.grading_scales ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.assessments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.scores ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.report_remarks ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.grading_scales,public.assessments,public.scores,public.report_remarks,public.subject_results,public.term_rankings FROM PUBLIC,anon,authenticated;
GRANT SELECT ON public.grading_scales,public.assessments,public.scores,public.report_remarks,public.subject_results,public.term_rankings TO authenticated;
GRANT INSERT(school_id,grade,min_score,max_score,remark) ON public.grading_scales TO authenticated;
GRANT UPDATE(min_score,max_score,remark) ON public.grading_scales TO authenticated;
GRANT DELETE ON public.grading_scales TO authenticated;
GRANT INSERT(school_id,term_id,class_id,subject_id,name,kind,max_score,weight_percent,assessed_on) ON public.assessments TO authenticated;
GRANT UPDATE(name,max_score,weight_percent,assessed_on,is_locked) ON public.assessments TO authenticated;
GRANT INSERT(school_id,assessment_id,enrollment_id,score) ON public.scores TO authenticated;
GRANT UPDATE(score) ON public.scores TO authenticated;
GRANT INSERT(school_id,enrollment_id,term_id,teacher_remark,head_remark) ON public.report_remarks TO authenticated;
GRANT UPDATE(teacher_remark,head_remark) ON public.report_remarks TO authenticated;

CREATE POLICY grading_scales_select ON public.grading_scales FOR SELECT TO authenticated USING(private.has_school_permission(school_id,'grades.read'));
CREATE POLICY grading_scales_insert ON public.grading_scales FOR INSERT TO authenticated WITH CHECK(private.has_school_permission(school_id,'grades.manage'));
CREATE POLICY grading_scales_update ON public.grading_scales FOR UPDATE TO authenticated USING(private.has_school_permission(school_id,'grades.manage')) WITH CHECK(private.has_school_permission(school_id,'grades.manage'));
CREATE POLICY grading_scales_delete ON public.grading_scales FOR DELETE TO authenticated USING(private.has_school_permission(school_id,'grades.manage'));
CREATE POLICY assessments_select ON public.assessments FOR SELECT TO authenticated USING(private.has_school_permission(school_id,'grades.read'));
CREATE POLICY assessments_insert ON public.assessments FOR INSERT TO authenticated WITH CHECK(private.has_school_permission(school_id,'grades.manage'));
CREATE POLICY assessments_update ON public.assessments FOR UPDATE TO authenticated USING(private.has_school_permission(school_id,'grades.manage')) WITH CHECK(private.has_school_permission(school_id,'grades.manage'));
CREATE POLICY scores_select ON public.scores FOR SELECT TO authenticated USING(private.has_school_permission(school_id,'grades.read'));
CREATE POLICY scores_insert ON public.scores FOR INSERT TO authenticated WITH CHECK(private.has_school_permission(school_id,'grades.manage'));
CREATE POLICY scores_update ON public.scores FOR UPDATE TO authenticated USING(private.has_school_permission(school_id,'grades.manage')) WITH CHECK(private.has_school_permission(school_id,'grades.manage'));
CREATE POLICY report_remarks_select ON public.report_remarks FOR SELECT TO authenticated USING(private.has_school_permission(school_id,'grades.read'));
CREATE POLICY report_remarks_insert ON public.report_remarks FOR INSERT TO authenticated WITH CHECK(private.has_school_permission(school_id,'grades.manage'));
CREATE POLICY report_remarks_update ON public.report_remarks FOR UPDATE TO authenticated USING(private.has_school_permission(school_id,'grades.manage')) WITH CHECK(private.has_school_permission(school_id,'grades.manage'));
COMMIT;
