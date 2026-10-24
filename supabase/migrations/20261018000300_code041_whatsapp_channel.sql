-- CODE 041: WhatsApp as a second delivery channel on the message outbox.
BEGIN;
ALTER TABLE public.sms_outbox ADD COLUMN channel text NOT NULL DEFAULT 'sms' CHECK(channel IN ('sms','whatsapp'));
DROP INDEX public.sms_outbox_once;
CREATE UNIQUE INDEX sms_outbox_once ON public.sms_outbox(school_id,student_id,kind,alert_day,channel) WHERE alert_day IS NOT NULL AND student_id IS NOT NULL;
GRANT INSERT(channel) ON public.sms_outbox TO authenticated;

DROP FUNCTION public.queue_absence_alerts(uuid,date);
DROP FUNCTION public.queue_fee_reminders(uuid);

CREATE FUNCTION public.queue_absence_alerts(p_school_id uuid, p_day date, p_channel text DEFAULT 'sms')
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_n integer;
BEGIN
 IF p_channel NOT IN ('sms','whatsapp') THEN RAISE EXCEPTION 'Invalid channel' USING ERRCODE='22023'; END IF;
 IF NOT private.has_school_permission(p_school_id,'communication.manage') THEN RAISE EXCEPTION 'Not allowed' USING ERRCODE='42501'; END IF;
 INSERT INTO public.sms_outbox(school_id,student_id,recipient_name,recipient_phone,body,kind,alert_day,channel)
 SELECT p_school_id,st.id,g.full_name,g.phone,
  'Dear '||g.full_name||', '||st.first_name||' '||st.last_name||' was marked absent on '||to_char(p_day,'DD Mon YYYY')||'. Please contact the school if this is unexpected.',
  'absence',p_day,p_channel
 FROM public.student_attendance a
 JOIN public.student_enrollments se ON se.id=a.enrollment_id AND se.school_id=a.school_id
 JOIN public.students st ON st.id=se.student_id AND st.school_id=se.school_id
 JOIN public.student_guardians g ON g.student_id=st.id AND g.school_id=st.school_id AND g.is_primary
 WHERE a.school_id=p_school_id AND a.school_day=p_day AND a.status='absent'
 ON CONFLICT DO NOTHING;
 GET DIAGNOSTICS v_n = ROW_COUNT;
 RETURN v_n;
END; $$;

CREATE FUNCTION public.queue_fee_reminders(p_school_id uuid, p_channel text DEFAULT 'sms')
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_n integer;
BEGIN
 IF p_channel NOT IN ('sms','whatsapp') THEN RAISE EXCEPTION 'Invalid channel' USING ERRCODE='22023'; END IF;
 IF NOT private.has_school_permission(p_school_id,'communication.manage')
    OR NOT private.has_school_permission(p_school_id,'fees.read') THEN
  RAISE EXCEPTION 'Not allowed' USING ERRCODE='42501';
 END IF;
 INSERT INTO public.sms_outbox(school_id,student_id,recipient_name,recipient_phone,body,kind,alert_day,channel)
 SELECT p_school_id,st.id,g.full_name,g.phone,
  'Dear '||g.full_name||', the outstanding school fees balance for '||st.first_name||' '||st.last_name||' is GHS '||to_char(x.balance/100.0,'FM999,999,990.00')||'. Kindly settle at the school bursar. Thank you.',
  'fee_reminder',CURRENT_DATE,p_channel
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
REVOKE ALL ON FUNCTION public.queue_absence_alerts(uuid,date,text),public.queue_fee_reminders(uuid,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.queue_absence_alerts(uuid,date,text),public.queue_fee_reminders(uuid,text) TO authenticated;
COMMIT;
