-- CODE 034: Announcements and an SMS outbox (absence alerts, fee reminders, custom messages).
BEGIN;
CREATE TABLE public.announcements (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 school_id uuid NOT NULL REFERENCES public.schools(id) ON DELETE RESTRICT,
 title text NOT NULL CHECK(char_length(btrim(title)) BETWEEN 3 AND 160),
 body text NOT NULL CHECK(char_length(btrim(body)) BETWEEN 3 AND 4000),
 audience text NOT NULL DEFAULT 'all' CHECK(audience IN ('all','staff','parents','students')),
 is_published boolean NOT NULL DEFAULT true,
 created_by uuid DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE SET NULL,
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX announcements_school_idx ON public.announcements(school_id,created_at DESC);
CREATE TRIGGER announcements_updated BEFORE UPDATE ON public.announcements FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE public.sms_outbox (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 school_id uuid NOT NULL REFERENCES public.schools(id) ON DELETE RESTRICT,
 student_id uuid,
 recipient_name text,
 recipient_phone text NOT NULL CHECK(char_length(btrim(recipient_phone)) BETWEEN 7 AND 25),
 body text NOT NULL CHECK(char_length(btrim(body)) BETWEEN 1 AND 480),
 kind text NOT NULL DEFAULT 'custom' CHECK(kind IN ('absence','fee_reminder','announcement','custom')),
 alert_day date,
 status text NOT NULL DEFAULT 'queued' CHECK(status IN ('queued','sent','failed','simulated')),
 provider_ref text,
 error text CHECK(error IS NULL OR char_length(error)<=300),
 queued_by uuid DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE SET NULL,
 created_at timestamptz NOT NULL DEFAULT now(),
 sent_at timestamptz,
 FOREIGN KEY(school_id,student_id) REFERENCES public.students(school_id,id) ON DELETE RESTRICT
);
CREATE INDEX sms_outbox_status_idx ON public.sms_outbox(school_id,status,created_at DESC);
-- A system alert is queued at most once per student per day.
CREATE UNIQUE INDEX sms_outbox_once ON public.sms_outbox(school_id,student_id,kind,alert_day) WHERE alert_day IS NOT NULL AND student_id IS NOT NULL;

CREATE OR REPLACE FUNCTION public.queue_absence_alerts(p_school_id uuid, p_day date)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_n integer;
BEGIN
 IF NOT private.has_school_permission(p_school_id,'communication.manage') THEN RAISE EXCEPTION 'Not allowed' USING ERRCODE='42501'; END IF;
 INSERT INTO public.sms_outbox(school_id,student_id,recipient_name,recipient_phone,body,kind,alert_day)
 SELECT p_school_id,st.id,g.full_name,g.phone,
  'Dear '||g.full_name||', '||st.first_name||' '||st.last_name||' was marked absent on '||to_char(p_day,'DD Mon YYYY')||'. Please contact the school if this is unexpected.',
  'absence',p_day
 FROM public.student_attendance a
 JOIN public.student_enrollments se ON se.id=a.enrollment_id AND se.school_id=a.school_id
 JOIN public.students st ON st.id=se.student_id AND st.school_id=se.school_id
 JOIN public.student_guardians g ON g.student_id=st.id AND g.school_id=st.school_id AND g.is_primary
 WHERE a.school_id=p_school_id AND a.school_day=p_day AND a.status='absent'
 ON CONFLICT DO NOTHING;
 GET DIAGNOSTICS v_n = ROW_COUNT;
 RETURN v_n;
END; $$;

CREATE OR REPLACE FUNCTION public.queue_fee_reminders(p_school_id uuid)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_n integer;
BEGIN
 IF NOT private.has_school_permission(p_school_id,'communication.manage')
    OR NOT private.has_school_permission(p_school_id,'fees.read') THEN
  RAISE EXCEPTION 'Not allowed' USING ERRCODE='42501';
 END IF;
 INSERT INTO public.sms_outbox(school_id,student_id,recipient_name,recipient_phone,body,kind,alert_day)
 SELECT p_school_id,st.id,g.full_name,g.phone,
  'Dear '||g.full_name||', the outstanding school fees balance for '||st.first_name||' '||st.last_name||' is GHS '||to_char(x.balance/100.0,'FM999,999,990.00')||'. Kindly settle at the school bursar. Thank you.',
  'fee_reminder',CURRENT_DATE
 FROM (SELECT i.student_id, SUM(COALESCE(l.t,0)-COALESCE(p.t,0)) AS balance
       FROM public.invoices i
       LEFT JOIN LATERAL (SELECT SUM(amount_pesewas) t FROM public.invoice_lines WHERE invoice_id=i.id AND school_id=i.school_id) l ON true
       LEFT JOIN LATERAL (SELECT SUM(amount_pesewas) t FROM public.payments WHERE invoice_id=i.id AND school_id=i.school_id) p ON true
       WHERE i.school_id=p_school_id AND i.status='open' GROUP BY i.student_id) x
 JOIN public.students st ON st.id=x.student_id AND st.school_id=p_school_id AND st.status='active'
 JOIN public.student_guardians g ON g.student_id=st.id AND g.school_id=st.school_id AND g.is_primary
 WHERE x.balance > 0
 ON CONFLICT DO NOTHING;
 GET DIAGNOSTICS v_n = ROW_COUNT;
 RETURN v_n;
END; $$;
REVOKE ALL ON FUNCTION public.queue_absence_alerts(uuid,date),public.queue_fee_reminders(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.queue_absence_alerts(uuid,date),public.queue_fee_reminders(uuid) TO authenticated;

INSERT INTO public.permissions(code,name,description) VALUES
 ('communication.read','View communication','View announcements and the SMS outbox'),
 ('communication.manage','Manage communication','Publish announcements and queue SMS messages')
ON CONFLICT(code) DO NOTHING;
INSERT INTO public.role_permissions(role_id,permission_id)
SELECT r.id,p.id FROM (VALUES
 ('proprietor','communication.read'),('proprietor','communication.manage'),
 ('school_admin','communication.read'),('school_admin','communication.manage'),
 ('head_teacher','communication.read'),('head_teacher','communication.manage'),
 ('bursar','communication.read'),
 ('teacher','communication.read'),('librarian','communication.read')
) v(role_code,permission_code)
JOIN public.roles r ON r.code=v.role_code JOIN public.permissions p ON p.code=v.permission_code
ON CONFLICT(role_id,permission_id) DO NOTHING;

ALTER TABLE public.announcements ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sms_outbox ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.announcements,public.sms_outbox FROM PUBLIC,anon,authenticated;
GRANT SELECT ON public.announcements,public.sms_outbox TO authenticated;
GRANT INSERT(school_id,title,body,audience,is_published) ON public.announcements TO authenticated;
GRANT UPDATE(title,body,audience,is_published) ON public.announcements TO authenticated;
GRANT DELETE ON public.announcements TO authenticated;
GRANT INSERT(school_id,student_id,recipient_name,recipient_phone,body,kind) ON public.sms_outbox TO authenticated;
GRANT UPDATE(status,provider_ref,error,sent_at) ON public.sms_outbox TO authenticated;
CREATE POLICY announcements_select ON public.announcements FOR SELECT TO authenticated USING(private.has_school_permission(school_id,'communication.read'));
CREATE POLICY announcements_insert ON public.announcements FOR INSERT TO authenticated WITH CHECK(private.has_school_permission(school_id,'communication.manage'));
CREATE POLICY announcements_update ON public.announcements FOR UPDATE TO authenticated USING(private.has_school_permission(school_id,'communication.manage')) WITH CHECK(private.has_school_permission(school_id,'communication.manage'));
CREATE POLICY announcements_delete ON public.announcements FOR DELETE TO authenticated USING(private.has_school_permission(school_id,'communication.manage'));
CREATE POLICY sms_outbox_select ON public.sms_outbox FOR SELECT TO authenticated USING(private.has_school_permission(school_id,'communication.read'));
CREATE POLICY sms_outbox_insert ON public.sms_outbox FOR INSERT TO authenticated WITH CHECK(private.has_school_permission(school_id,'communication.manage'));
CREATE POLICY sms_outbox_update ON public.sms_outbox FOR UPDATE TO authenticated USING(private.has_school_permission(school_id,'communication.manage')) WITH CHECK(private.has_school_permission(school_id,'communication.manage'));
COMMIT;
