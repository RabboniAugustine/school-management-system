-- CODE 038: Reports overview plus small helper functions used by the HR and portal screens.
BEGIN;
INSERT INTO public.permissions(code,name,description) VALUES
 ('reports.read','View reports','View school-wide enrollment, attendance, finance and results summaries')
ON CONFLICT(code) DO NOTHING;
INSERT INTO public.role_permissions(role_id,permission_id)
SELECT r.id,p.id FROM (VALUES
 ('proprietor','reports.read'),('school_admin','reports.read'),('head_teacher','reports.read'),('bursar','reports.read')
) v(role_code,permission_code)
JOIN public.roles r ON r.code=v.role_code JOIN public.permissions p ON p.code=v.permission_code
ON CONFLICT(role_id,permission_id) DO NOTHING;

-- The signed-in user's own staff record in a school (null if none).
CREATE OR REPLACE FUNCTION public.my_staff_id(p_school_id uuid)
RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
 SELECT s.id FROM public.staff_members s WHERE s.school_id=p_school_id AND s.user_id=(SELECT auth.uid()) LIMIT 1;
$$;
REVOKE ALL ON FUNCTION public.my_staff_id(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.my_staff_id(uuid) TO authenticated;

-- Portal links with the linked account's email (emails live in auth.users, which clients cannot read).
CREATE OR REPLACE FUNCTION public.list_portal_links(p_school_id uuid)
RETURNS TABLE(link_id uuid, student_id uuid, email text, relation text, created_at timestamptz)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $$
BEGIN
 IF NOT private.has_school_permission(p_school_id,'portal.manage') THEN RAISE EXCEPTION 'Not allowed' USING ERRCODE='42501'; END IF;
 RETURN QUERY SELECT l.id,l.student_id,u.email::text,l.relation,l.created_at
  FROM public.portal_links l JOIN auth.users u ON u.id=l.user_id WHERE l.school_id=p_school_id ORDER BY l.created_at DESC;
END; $$;
REVOKE ALL ON FUNCTION public.list_portal_links(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.list_portal_links(uuid) TO authenticated;

-- One round trip for the reports dashboard. Each section is included only if the caller may see that data.
CREATE OR REPLACE FUNCTION public.report_overview(p_school_id uuid, p_from date, p_to date)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $$
DECLARE v jsonb := '{}'::jsonb; v_term uuid;
BEGIN
 IF NOT private.has_school_permission(p_school_id,'reports.read') THEN RAISE EXCEPTION 'Not allowed' USING ERRCODE='42501'; END IF;
 IF p_to < p_from OR p_to - p_from > 366 THEN RAISE EXCEPTION 'Invalid date range' USING ERRCODE='22023'; END IF;

 v := v || jsonb_build_object('students_active',(SELECT COUNT(*) FROM public.students WHERE school_id=p_school_id AND status='active'),
   'staff_active',(SELECT COUNT(*) FROM public.staff_members WHERE school_id=p_school_id AND status IN ('active','on_leave')));

 v := v || jsonb_build_object('enrollment_by_class',COALESCE((
   SELECT jsonb_agg(jsonb_build_object('class',c.name,'students',x.n) ORDER BY c.level_order,c.name)
   FROM (SELECT se.class_id, COUNT(*) n FROM public.student_enrollments se
         JOIN public.academic_years ay ON ay.id=se.academic_year_id AND ay.school_id=se.school_id AND ay.status='active'
         WHERE se.school_id=p_school_id AND se.status='active' GROUP BY se.class_id) x
   JOIN public.school_classes c ON c.id=x.class_id AND c.school_id=p_school_id),'[]'::jsonb));

 v := v || jsonb_build_object('attendance',COALESCE((
   SELECT jsonb_object_agg(status,n) FROM (SELECT status, COUNT(*) n FROM public.student_attendance
     WHERE school_id=p_school_id AND school_day BETWEEN p_from AND p_to GROUP BY status) a),'{}'::jsonb));

 IF private.has_school_permission(p_school_id,'fees.read') THEN
  v := v || jsonb_build_object('finance',jsonb_build_object(
   'collected_pesewas',COALESCE((SELECT SUM(amount_pesewas) FROM public.payments WHERE school_id=p_school_id AND paid_on BETWEEN p_from AND p_to),0),
   'expenses_pesewas',COALESCE((SELECT SUM(amount_pesewas) FROM public.expenses WHERE school_id=p_school_id AND spent_on BETWEEN p_from AND p_to),0),
   'billed_pesewas',COALESCE((SELECT SUM(l.amount_pesewas) FROM public.invoice_lines l JOIN public.invoices i ON i.id=l.invoice_id AND i.school_id=l.school_id
        WHERE i.school_id=p_school_id AND i.status='open' AND i.issued_on BETWEEN p_from AND p_to),0),
   'outstanding_pesewas',COALESCE((SELECT SUM(b.total_pesewas-b.paid_pesewas) FROM public.invoice_balances b WHERE b.school_id=p_school_id AND b.status='open'),0),
   'by_method',COALESCE((SELECT jsonb_object_agg(method,t) FROM (SELECT method,SUM(amount_pesewas) t FROM public.payments
        WHERE school_id=p_school_id AND paid_on BETWEEN p_from AND p_to GROUP BY method) m),'{}'::jsonb)));
 END IF;

 IF private.has_school_permission(p_school_id,'grades.read') THEN
  SELECT id INTO v_term FROM public.terms WHERE school_id=p_school_id AND status='active' ORDER BY starts_on DESC LIMIT 1;
  v := v || jsonb_build_object('grades',jsonb_build_object('term_id',v_term,'distribution',COALESCE((
    SELECT jsonb_object_agg(COALESCE(grade,'—'),n) FROM (SELECT grade, COUNT(*) n FROM public.subject_results
      WHERE school_id=p_school_id AND term_id=v_term GROUP BY grade) g),'{}'::jsonb)));
 END IF;
 RETURN v;
END; $$;
REVOKE ALL ON FUNCTION public.report_overview(uuid,date,date) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.report_overview(uuid,date,date) TO authenticated;
COMMIT;
