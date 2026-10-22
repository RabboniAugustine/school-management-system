-- CODE 037: Parent and student portal. A portal link ties a user to the students they may see.
BEGIN;
CREATE TABLE public.portal_links (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 school_id uuid NOT NULL REFERENCES public.schools(id) ON DELETE RESTRICT,
 user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
 student_id uuid NOT NULL,
 relation text NOT NULL CHECK(relation IN ('parent','student')),
 created_by uuid DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE SET NULL,
 created_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(school_id,user_id,student_id),
 FOREIGN KEY(school_id,student_id) REFERENCES public.students(school_id,id) ON DELETE CASCADE
);
CREATE INDEX portal_links_user_idx ON public.portal_links(user_id,school_id);

-- True when the signed-in user holds portal access in the school AND is linked to that student.
CREATE OR REPLACE FUNCTION private.can_view_student(p_school_id uuid, p_student_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
 SELECT private.has_school_permission(p_school_id,'portal.read')
  AND EXISTS(SELECT 1 FROM public.portal_links l WHERE l.school_id=p_school_id AND l.student_id=p_student_id AND l.user_id=(SELECT auth.uid()));
$$;
REVOKE ALL ON FUNCTION private.can_view_student(uuid,uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION private.can_view_student(uuid,uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.link_portal_user(p_school_id uuid, p_email text, p_student_id uuid, p_relation text)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_user uuid; v_member uuid; v_role uuid; v_link uuid;
BEGIN
 IF NOT private.has_school_permission(p_school_id,'portal.manage') THEN RAISE EXCEPTION 'Not allowed' USING ERRCODE='42501'; END IF;
 IF p_relation NOT IN ('parent','student') THEN RAISE EXCEPTION 'Invalid relation' USING ERRCODE='22023'; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.students WHERE id=p_student_id AND school_id=p_school_id) THEN RAISE EXCEPTION 'Student not found' USING ERRCODE='23503'; END IF;
 SELECT u.id INTO v_user FROM auth.users u WHERE lower(u.email)=lower(btrim(p_email));
 IF v_user IS NULL THEN RAISE EXCEPTION 'No account with that email. Ask them to sign up first.' USING ERRCODE='P0002'; END IF;
 SELECT id INTO v_role FROM public.roles WHERE code=p_relation;
 SELECT id INTO v_member FROM public.school_memberships WHERE school_id=p_school_id AND user_id=v_user;
 IF v_member IS NULL THEN
  INSERT INTO public.school_memberships(school_id,user_id,status,joined_at) VALUES(p_school_id,v_user,'active',now()) RETURNING id INTO v_member;
 ELSE
  UPDATE public.school_memberships SET status='active', joined_at=COALESCE(joined_at,now()) WHERE id=v_member AND status<>'active';
 END IF;
 IF NOT EXISTS(SELECT 1 FROM public.user_roles WHERE membership_id=v_member AND school_id=p_school_id AND role_id=v_role) THEN
  INSERT INTO public.user_roles(membership_id,school_id,role_id) VALUES(v_member,p_school_id,v_role);
 END IF;
 INSERT INTO public.portal_links(school_id,user_id,student_id,relation) VALUES(p_school_id,v_user,p_student_id,p_relation)
 ON CONFLICT(school_id,user_id,student_id) DO UPDATE SET relation=EXCLUDED.relation RETURNING id INTO v_link;
 RETURN v_link;
END; $$;
REVOKE ALL ON FUNCTION public.link_portal_user(uuid,text,uuid,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.link_portal_user(uuid,text,uuid,text) TO authenticated;

INSERT INTO public.permissions(code,name,description) VALUES
 ('portal.read','Use the family portal','View linked students attendance, fees and results'),
 ('portal.manage','Manage portal access','Link parents and students to their portal accounts')
ON CONFLICT(code) DO NOTHING;
INSERT INTO public.role_permissions(role_id,permission_id)
SELECT r.id,p.id FROM (VALUES
 ('parent','portal.read'),('student','portal.read'),
 ('proprietor','portal.manage'),('school_admin','portal.manage')
) v(role_code,permission_code)
JOIN public.roles r ON r.code=v.role_code JOIN public.permissions p ON p.code=v.permission_code
ON CONFLICT(role_id,permission_id) DO NOTHING;

ALTER TABLE public.portal_links ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.portal_links FROM PUBLIC,anon,authenticated;
GRANT SELECT,DELETE ON public.portal_links TO authenticated;
CREATE POLICY portal_links_select ON public.portal_links FOR SELECT TO authenticated USING(
 private.has_school_permission(school_id,'portal.manage') OR user_id=(SELECT auth.uid()));
CREATE POLICY portal_links_delete ON public.portal_links FOR DELETE TO authenticated USING(private.has_school_permission(school_id,'portal.manage'));

-- Read-only portal access: extra permissive SELECT policies that only match a user's linked students.
CREATE POLICY portal_students ON public.students FOR SELECT TO authenticated USING(private.can_view_student(school_id,id));
CREATE POLICY portal_enrollments ON public.student_enrollments FOR SELECT TO authenticated USING(private.can_view_student(school_id,student_id));
CREATE POLICY portal_attendance ON public.student_attendance FOR SELECT TO authenticated USING(
 EXISTS(SELECT 1 FROM public.student_enrollments se WHERE se.id=enrollment_id AND se.school_id=student_attendance.school_id AND private.can_view_student(se.school_id,se.student_id)));
CREATE POLICY portal_invoices ON public.invoices FOR SELECT TO authenticated USING(private.can_view_student(school_id,student_id));
CREATE POLICY portal_invoice_lines ON public.invoice_lines FOR SELECT TO authenticated USING(
 EXISTS(SELECT 1 FROM public.invoices i WHERE i.id=invoice_id AND i.school_id=invoice_lines.school_id AND private.can_view_student(i.school_id,i.student_id)));
CREATE POLICY portal_payments ON public.payments FOR SELECT TO authenticated USING(
 EXISTS(SELECT 1 FROM public.invoices i WHERE i.id=invoice_id AND i.school_id=payments.school_id AND private.can_view_student(i.school_id,i.student_id)));
CREATE POLICY portal_scores ON public.scores FOR SELECT TO authenticated USING(
 EXISTS(SELECT 1 FROM public.student_enrollments se WHERE se.id=enrollment_id AND se.school_id=scores.school_id AND private.can_view_student(se.school_id,se.student_id)));
CREATE POLICY portal_remarks ON public.report_remarks FOR SELECT TO authenticated USING(
 EXISTS(SELECT 1 FROM public.student_enrollments se WHERE se.id=enrollment_id AND se.school_id=report_remarks.school_id AND private.can_view_student(se.school_id,se.student_id)));
-- Lookup data needed to label results (names only).
CREATE POLICY portal_assessments ON public.assessments FOR SELECT TO authenticated USING(private.has_school_permission(school_id,'portal.read')
 AND EXISTS(SELECT 1 FROM public.student_enrollments se JOIN public.portal_links l ON l.student_id=se.student_id AND l.school_id=se.school_id
   WHERE se.school_id=assessments.school_id AND se.class_id=assessments.class_id AND l.user_id=(SELECT auth.uid())));
CREATE POLICY portal_scale ON public.grading_scales FOR SELECT TO authenticated USING(private.has_school_permission(school_id,'portal.read'));
CREATE POLICY portal_subjects ON public.school_subjects FOR SELECT TO authenticated USING(private.has_school_permission(school_id,'portal.read'));
CREATE POLICY portal_classes ON public.school_classes FOR SELECT TO authenticated USING(private.has_school_permission(school_id,'portal.read'));
CREATE POLICY portal_years ON public.academic_years FOR SELECT TO authenticated USING(private.has_school_permission(school_id,'portal.read'));
CREATE POLICY portal_terms ON public.terms FOR SELECT TO authenticated USING(private.has_school_permission(school_id,'portal.read'));
CREATE POLICY portal_announcements ON public.announcements FOR SELECT TO authenticated USING(
 is_published AND audience IN ('all','parents','students') AND private.has_school_permission(school_id,'portal.read'));
COMMIT;
