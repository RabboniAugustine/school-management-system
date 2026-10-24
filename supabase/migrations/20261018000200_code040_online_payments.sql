-- CODE 040: Online fee payments (Paystack). The browser never records a payment: only the verified
-- webhook/verify path (service role) can turn a pending online payment into a real payment row.
BEGIN;
CREATE TABLE public.school_payment_settings (
 school_id uuid PRIMARY KEY REFERENCES public.schools(id) ON DELETE CASCADE,
 online_enabled boolean NOT NULL DEFAULT false,
 paystack_subaccount_code text CHECK(paystack_subaccount_code IS NULL OR paystack_subaccount_code ~ '^ACCT_[A-Za-z0-9]{6,40}$'),
 updated_at timestamptz NOT NULL DEFAULT now(),
 CHECK(NOT online_enabled OR paystack_subaccount_code IS NOT NULL)
);
CREATE TRIGGER school_payment_settings_updated BEFORE UPDATE ON public.school_payment_settings FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE public.online_payments (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 school_id uuid NOT NULL REFERENCES public.schools(id) ON DELETE RESTRICT,
 invoice_id uuid NOT NULL,
 initiated_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
 provider text NOT NULL DEFAULT 'paystack' CHECK(provider IN ('paystack')),
 reference text NOT NULL UNIQUE CHECK(char_length(reference) BETWEEN 10 AND 80),
 amount_pesewas bigint NOT NULL CHECK(amount_pesewas > 0),
 status text NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','success','failed')),
 channel text,
 provider_ref text,
 payment_id uuid,
 failure_reason text CHECK(failure_reason IS NULL OR char_length(failure_reason)<=200),
 needs_review boolean NOT NULL DEFAULT false,
 created_at timestamptz NOT NULL DEFAULT now(),
 completed_at timestamptz,
 FOREIGN KEY(school_id,invoice_id) REFERENCES public.invoices(school_id,id) ON DELETE RESTRICT,
 FOREIGN KEY(school_id,payment_id) REFERENCES public.payments(school_id,id) ON DELETE RESTRICT
);
CREATE INDEX online_payments_invoice_idx ON public.online_payments(school_id,invoice_id);

-- Starts a payment for an invoice. Allowed for finance staff and for portal users linked to the invoice's student.
CREATE OR REPLACE FUNCTION public.start_online_payment(p_school_id uuid, p_invoice_id uuid, p_amount_pesewas bigint)
RETURNS TABLE(reference text, amount_pesewas bigint, subaccount_code text)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_student uuid; v_status text; v_total bigint; v_paid bigint; v_sub text; v_enabled boolean; v_ref text;
BEGIN
 SELECT i.student_id,i.status INTO v_student,v_status FROM public.invoices i WHERE i.id=p_invoice_id AND i.school_id=p_school_id;
 IF v_student IS NULL OR NOT (private.has_school_permission(p_school_id,'fees.manage') OR private.can_view_student(p_school_id,v_student)) THEN
  RAISE EXCEPTION 'Invoice not found' USING ERRCODE='42501';
 END IF;
 SELECT s.online_enabled,s.paystack_subaccount_code INTO v_enabled,v_sub FROM public.school_payment_settings s WHERE s.school_id=p_school_id;
 IF NOT COALESCE(v_enabled,false) THEN RAISE EXCEPTION 'Online payments are not enabled for this school' USING ERRCODE='23514'; END IF;
 IF v_status <> 'open' THEN RAISE EXCEPTION 'Invoice is not open' USING ERRCODE='23514'; END IF;
 SELECT COALESCE(SUM(l.amount_pesewas),0) INTO v_total FROM public.invoice_lines l WHERE l.invoice_id=p_invoice_id AND l.school_id=p_school_id;
 SELECT COALESCE(SUM(p.amount_pesewas),0) INTO v_paid FROM public.payments p WHERE p.invoice_id=p_invoice_id AND p.school_id=p_school_id;
 IF p_amount_pesewas IS NULL OR p_amount_pesewas < 100 THEN RAISE EXCEPTION 'Minimum online payment is GHS 1.00' USING ERRCODE='22023'; END IF;
 IF p_amount_pesewas > v_total - v_paid THEN RAISE EXCEPTION 'Amount is more than the outstanding balance' USING ERRCODE='23514'; END IF;
 v_ref := 'SMS-'||replace(gen_random_uuid()::text,'-','');
 INSERT INTO public.online_payments(school_id,invoice_id,initiated_by,reference,amount_pesewas) VALUES(p_school_id,p_invoice_id,auth.uid(),v_ref,p_amount_pesewas);
 RETURN QUERY SELECT v_ref,p_amount_pesewas,v_sub;
END; $$;
REVOKE ALL ON FUNCTION public.start_online_payment(uuid,uuid,bigint) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.start_online_payment(uuid,uuid,bigint) TO authenticated;

-- Called ONLY by the server after Paystack has been verified. Idempotent: repeats return the same payment.
CREATE OR REPLACE FUNCTION public.apply_online_payment(p_reference text, p_amount_pesewas bigint, p_channel text, p_provider_ref text)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE o public.online_payments%ROWTYPE; v_payment uuid; v_method text;
BEGIN
 SELECT * INTO o FROM public.online_payments WHERE reference=p_reference FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Unknown reference' USING ERRCODE='P0002'; END IF;
 IF o.status='success' THEN RETURN o.payment_id; END IF;
 IF o.status='failed' AND NOT o.needs_review THEN RAISE EXCEPTION 'Payment already marked failed' USING ERRCODE='23514'; END IF;
 IF p_amount_pesewas <> o.amount_pesewas THEN
  UPDATE public.online_payments SET status='failed',failure_reason='Amount mismatch: expected '||o.amount_pesewas||' got '||p_amount_pesewas,needs_review=true,completed_at=now() WHERE id=o.id;
  RETURN NULL;
 END IF;
 v_method := CASE WHEN p_channel IN ('mobile_money','ussd','qr') THEN 'mobile_money' WHEN p_channel IN ('bank','bank_transfer') THEN 'bank' ELSE 'card' END;
 BEGIN
  INSERT INTO public.payments(school_id,invoice_id,receipt_number,amount_pesewas,method,reference,paid_on,received_by)
  VALUES(o.school_id,o.invoice_id,'RCT-ON-'||upper(substr(replace(o.id::text,'-',''),1,10)),o.amount_pesewas,v_method,left(COALESCE(p_provider_ref,o.reference),100),CURRENT_DATE,NULL)
  RETURNING id INTO v_payment;
 EXCEPTION WHEN check_violation THEN
  -- The invoice was settled another way in the meantime. Money was taken online, so flag it for a refund.
  UPDATE public.online_payments SET status='failed',failure_reason='Invoice already settled; refund required',needs_review=true,channel=p_channel,provider_ref=p_provider_ref,completed_at=now() WHERE id=o.id;
  RETURN NULL;
 END;
 UPDATE public.online_payments SET status='success',channel=p_channel,provider_ref=p_provider_ref,payment_id=v_payment,needs_review=false,failure_reason=NULL,completed_at=now() WHERE id=o.id;
 RETURN v_payment;
END; $$;
REVOKE ALL ON FUNCTION public.apply_online_payment(text,bigint,text,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.apply_online_payment(text,bigint,text,text) TO service_role;

CREATE OR REPLACE FUNCTION public.fail_online_payment(p_reference text, p_reason text)
RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path = '' AS $$
 UPDATE public.online_payments SET status='failed',failure_reason=left(p_reason,200),completed_at=now() WHERE reference=p_reference AND status='pending';
$$;
REVOKE ALL ON FUNCTION public.fail_online_payment(text,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.fail_online_payment(text,text) TO service_role;

ALTER TABLE public.school_payment_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.online_payments ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.school_payment_settings,public.online_payments FROM PUBLIC,anon,authenticated;
GRANT SELECT ON public.school_payment_settings,public.online_payments TO authenticated;
GRANT INSERT(school_id,online_enabled,paystack_subaccount_code) ON public.school_payment_settings TO authenticated;
GRANT UPDATE(online_enabled,paystack_subaccount_code) ON public.school_payment_settings TO authenticated;
GRANT SELECT,INSERT,UPDATE ON public.school_payment_settings,public.online_payments TO service_role;
CREATE POLICY pay_settings_select ON public.school_payment_settings FOR SELECT TO authenticated USING(private.has_school_permission(school_id,'fees.read') OR private.has_school_permission(school_id,'portal.read'));
CREATE POLICY pay_settings_insert ON public.school_payment_settings FOR INSERT TO authenticated WITH CHECK(private.has_school_permission(school_id,'fees.manage'));
CREATE POLICY pay_settings_update ON public.school_payment_settings FOR UPDATE TO authenticated USING(private.has_school_permission(school_id,'fees.manage')) WITH CHECK(private.has_school_permission(school_id,'fees.manage'));
CREATE POLICY online_payments_select ON public.online_payments FOR SELECT TO authenticated USING(private.has_school_permission(school_id,'fees.read') OR initiated_by=(SELECT auth.uid()));
COMMIT;
