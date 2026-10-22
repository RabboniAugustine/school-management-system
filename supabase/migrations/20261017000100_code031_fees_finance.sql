-- CODE 031: Fees and finance (fee structures, invoices, payments, expenses).
-- Money is stored as integer pesewas (1 GHS = 100 pesewas) to avoid rounding errors.
BEGIN;

CREATE UNIQUE INDEX IF NOT EXISTS terms_school_id_id_uidx ON public.terms(school_id,id);

CREATE TABLE public.fee_structures (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 school_id uuid NOT NULL REFERENCES public.schools(id) ON DELETE RESTRICT,
 academic_year_id uuid NOT NULL,
 term_id uuid,
 class_id uuid,
 name text NOT NULL CHECK(char_length(btrim(name)) BETWEEN 2 AND 120),
 amount_pesewas bigint NOT NULL CHECK(amount_pesewas > 0 AND amount_pesewas < 100000000000),
 is_active boolean NOT NULL DEFAULT true,
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(school_id,id),
 FOREIGN KEY(school_id,academic_year_id) REFERENCES public.academic_years(school_id,id) ON DELETE RESTRICT,
 FOREIGN KEY(school_id,term_id) REFERENCES public.terms(school_id,id) ON DELETE RESTRICT,
 FOREIGN KEY(school_id,class_id) REFERENCES public.school_classes(school_id,id) ON DELETE RESTRICT
);
CREATE INDEX fee_structures_scope_idx ON public.fee_structures(school_id,academic_year_id,term_id,class_id);

CREATE TABLE public.invoices (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 school_id uuid NOT NULL REFERENCES public.schools(id) ON DELETE RESTRICT,
 student_id uuid NOT NULL,
 academic_year_id uuid NOT NULL,
 term_id uuid,
 invoice_number text NOT NULL CHECK(char_length(btrim(invoice_number)) BETWEEN 3 AND 40),
 issued_on date NOT NULL DEFAULT CURRENT_DATE,
 due_on date,
 status text NOT NULL DEFAULT 'open' CHECK(status IN ('open','cancelled')),
 notes text CHECK(notes IS NULL OR char_length(notes)<=500),
 created_by uuid DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE SET NULL,
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(school_id,id), UNIQUE(school_id,invoice_number),
 FOREIGN KEY(school_id,student_id) REFERENCES public.students(school_id,id) ON DELETE RESTRICT,
 FOREIGN KEY(school_id,academic_year_id) REFERENCES public.academic_years(school_id,id) ON DELETE RESTRICT,
 FOREIGN KEY(school_id,term_id) REFERENCES public.terms(school_id,id) ON DELETE RESTRICT
);
CREATE INDEX invoices_student_idx ON public.invoices(school_id,student_id);
CREATE INDEX invoices_term_idx ON public.invoices(school_id,academic_year_id,term_id);
-- One generated invoice per student per term (prevents double billing on re-run).
CREATE UNIQUE INDEX invoices_one_per_term ON public.invoices(school_id,student_id,academic_year_id,term_id)
 WHERE term_id IS NOT NULL AND status='open';

CREATE TABLE public.invoice_lines (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 school_id uuid NOT NULL REFERENCES public.schools(id) ON DELETE RESTRICT,
 invoice_id uuid NOT NULL,
 description text NOT NULL CHECK(char_length(btrim(description)) BETWEEN 2 AND 160),
 amount_pesewas bigint NOT NULL CHECK(amount_pesewas <> 0 AND abs(amount_pesewas) < 100000000000),
 created_at timestamptz NOT NULL DEFAULT now(),
 FOREIGN KEY(school_id,invoice_id) REFERENCES public.invoices(school_id,id) ON DELETE RESTRICT
);
CREATE INDEX invoice_lines_invoice_idx ON public.invoice_lines(school_id,invoice_id);

CREATE TABLE public.payments (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 school_id uuid NOT NULL REFERENCES public.schools(id) ON DELETE RESTRICT,
 invoice_id uuid NOT NULL,
 receipt_number text NOT NULL CHECK(char_length(btrim(receipt_number)) BETWEEN 3 AND 40),
 amount_pesewas bigint NOT NULL CHECK(amount_pesewas > 0 AND amount_pesewas < 100000000000),
 method text NOT NULL CHECK(method IN ('cash','mobile_money','bank','card','cheque')),
 reference text CHECK(reference IS NULL OR char_length(reference)<=100),
 paid_on date NOT NULL DEFAULT CURRENT_DATE,
 received_by uuid DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE SET NULL,
 created_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(school_id,id), UNIQUE(school_id,receipt_number),
 FOREIGN KEY(school_id,invoice_id) REFERENCES public.invoices(school_id,id) ON DELETE RESTRICT
);
CREATE INDEX payments_invoice_idx ON public.payments(school_id,invoice_id);
CREATE INDEX payments_paid_idx ON public.payments(school_id,paid_on);

CREATE TABLE public.expenses (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 school_id uuid NOT NULL REFERENCES public.schools(id) ON DELETE RESTRICT,
 category text NOT NULL CHECK(char_length(btrim(category)) BETWEEN 2 AND 80),
 description text NOT NULL CHECK(char_length(btrim(description)) BETWEEN 2 AND 300),
 amount_pesewas bigint NOT NULL CHECK(amount_pesewas > 0 AND amount_pesewas < 100000000000),
 spent_on date NOT NULL DEFAULT CURRENT_DATE,
 recorded_by uuid DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE SET NULL,
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX expenses_date_idx ON public.expenses(school_id,spent_on);

CREATE TRIGGER fee_structures_updated BEFORE UPDATE ON public.fee_structures FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER invoices_updated BEFORE UPDATE ON public.invoices FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Payments may never exceed what is still owed (checked under a row lock to stop double payments racing).
CREATE OR REPLACE FUNCTION private.validate_payment()
RETURNS trigger LANGUAGE plpgsql SET search_path = '' AS $$
DECLARE v_total bigint; v_paid bigint; v_status text;
BEGIN
 SELECT status INTO v_status FROM public.invoices WHERE id=NEW.invoice_id AND school_id=NEW.school_id FOR UPDATE;
 IF v_status IS DISTINCT FROM 'open' THEN
  RAISE EXCEPTION 'Invoice is not open for payment' USING ERRCODE='23514';
 END IF;
 SELECT COALESCE(SUM(amount_pesewas),0) INTO v_total FROM public.invoice_lines WHERE invoice_id=NEW.invoice_id AND school_id=NEW.school_id;
 SELECT COALESCE(SUM(amount_pesewas),0) INTO v_paid FROM public.payments WHERE invoice_id=NEW.invoice_id AND school_id=NEW.school_id;
 IF v_paid + NEW.amount_pesewas > v_total THEN
  RAISE EXCEPTION 'Payment exceeds the outstanding balance' USING ERRCODE='23514';
 END IF;
 RETURN NEW;
END; $$;
CREATE TRIGGER payments_validate BEFORE INSERT ON public.payments FOR EACH ROW EXECUTE FUNCTION private.validate_payment();

-- Payments and invoice lines are append-only (corrections are new rows), so the money trail stays auditable.
CREATE OR REPLACE FUNCTION private.block_mutation()
RETURNS trigger LANGUAGE plpgsql SET search_path = '' AS $$
BEGIN RAISE EXCEPTION 'This record is append-only' USING ERRCODE='23514'; END; $$;
CREATE TRIGGER payments_immutable BEFORE UPDATE OR DELETE ON public.payments FOR EACH ROW EXECUTE FUNCTION private.block_mutation();
CREATE TRIGGER invoice_lines_immutable BEFORE UPDATE OR DELETE ON public.invoice_lines FOR EACH ROW EXECUTE FUNCTION private.block_mutation();

-- Balances per invoice. security_invoker keeps the caller's RLS in force.
CREATE VIEW public.invoice_balances WITH (security_invoker = true) AS
SELECT i.id AS invoice_id, i.school_id, i.student_id, i.academic_year_id, i.term_id, i.invoice_number, i.issued_on, i.due_on, i.status,
 COALESCE((SELECT SUM(l.amount_pesewas) FROM public.invoice_lines l WHERE l.invoice_id=i.id AND l.school_id=i.school_id),0)::bigint AS total_pesewas,
 COALESCE((SELECT SUM(p.amount_pesewas) FROM public.payments p WHERE p.invoice_id=i.id AND p.school_id=i.school_id),0)::bigint AS paid_pesewas
FROM public.invoices i;

-- Bills every active enrolled student of a class (or all classes) from the matching fee structures.
CREATE OR REPLACE FUNCTION public.generate_term_invoices(p_school_id uuid, p_academic_year_id uuid, p_term_id uuid, p_class_id uuid DEFAULT NULL, p_due_on date DEFAULT NULL)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE r record; v_invoice uuid; v_count integer := 0; v_seq bigint;
BEGIN
 IF NOT private.has_school_permission(p_school_id,'fees.manage') THEN
  RAISE EXCEPTION 'Not allowed' USING ERRCODE='42501';
 END IF;
 FOR r IN
  SELECT se.student_id, se.class_id FROM public.student_enrollments se
  WHERE se.school_id=p_school_id AND se.academic_year_id=p_academic_year_id AND se.status='active'
   AND (p_class_id IS NULL OR se.class_id=p_class_id)
   AND NOT EXISTS (SELECT 1 FROM public.invoices i WHERE i.school_id=p_school_id AND i.student_id=se.student_id
        AND i.academic_year_id=p_academic_year_id AND i.term_id=p_term_id AND i.status='open')
   AND EXISTS (SELECT 1 FROM public.fee_structures f WHERE f.school_id=p_school_id AND f.academic_year_id=p_academic_year_id
        AND f.is_active AND (f.term_id IS NULL OR f.term_id=p_term_id) AND (f.class_id IS NULL OR f.class_id=se.class_id))
 LOOP
  SELECT COUNT(*)+1 INTO v_seq FROM public.invoices WHERE school_id=p_school_id;
  INSERT INTO public.invoices(school_id,student_id,academic_year_id,term_id,invoice_number,due_on)
  VALUES(p_school_id,r.student_id,p_academic_year_id,p_term_id,'INV-'||to_char(now(),'YYYY')||'-'||lpad((v_seq+v_count)::text,5,'0')||'-'||substr(gen_random_uuid()::text,1,4),p_due_on)
  RETURNING id INTO v_invoice;
  INSERT INTO public.invoice_lines(school_id,invoice_id,description,amount_pesewas)
  SELECT p_school_id,v_invoice,f.name,f.amount_pesewas FROM public.fee_structures f
  WHERE f.school_id=p_school_id AND f.academic_year_id=p_academic_year_id AND f.is_active
   AND (f.term_id IS NULL OR f.term_id=p_term_id) AND (f.class_id IS NULL OR f.class_id=r.class_id);
  v_count := v_count + 1;
 END LOOP;
 RETURN v_count;
END; $$;
REVOKE ALL ON FUNCTION public.generate_term_invoices(uuid,uuid,uuid,uuid,date) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.generate_term_invoices(uuid,uuid,uuid,uuid,date) TO authenticated;

INSERT INTO public.permissions(code,name,description) VALUES
 ('fees.read','View fees and finance','View fee structures, invoices, payments and expenses'),
 ('fees.manage','Manage fees and finance','Create fee structures, invoices, payments and expenses')
ON CONFLICT(code) DO NOTHING;
INSERT INTO public.role_permissions(role_id,permission_id)
SELECT r.id,p.id FROM (VALUES
 ('proprietor','fees.read'),('proprietor','fees.manage'),
 ('school_admin','fees.read'),('school_admin','fees.manage'),
 ('bursar','fees.read'),('bursar','fees.manage'),
 ('head_teacher','fees.read')
) v(role_code,permission_code)
JOIN public.roles r ON r.code=v.role_code JOIN public.permissions p ON p.code=v.permission_code
ON CONFLICT(role_id,permission_id) DO NOTHING;

ALTER TABLE public.fee_structures ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.invoices ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.invoice_lines ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.expenses ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.fee_structures,public.invoices,public.invoice_lines,public.payments,public.expenses,public.invoice_balances FROM PUBLIC,anon,authenticated;
GRANT SELECT ON public.fee_structures,public.invoices,public.invoice_lines,public.payments,public.expenses,public.invoice_balances TO authenticated;
GRANT INSERT(school_id,academic_year_id,term_id,class_id,name,amount_pesewas) ON public.fee_structures TO authenticated;
GRANT UPDATE(name,amount_pesewas,is_active) ON public.fee_structures TO authenticated;
GRANT INSERT(school_id,student_id,academic_year_id,term_id,invoice_number,due_on,notes) ON public.invoices TO authenticated;
GRANT UPDATE(due_on,notes,status) ON public.invoices TO authenticated;
GRANT INSERT(school_id,invoice_id,description,amount_pesewas) ON public.invoice_lines TO authenticated;
GRANT INSERT(school_id,invoice_id,receipt_number,amount_pesewas,method,reference,paid_on) ON public.payments TO authenticated;
GRANT INSERT(school_id,category,description,amount_pesewas,spent_on) ON public.expenses TO authenticated;

CREATE POLICY fee_structures_select ON public.fee_structures FOR SELECT TO authenticated USING(private.has_school_permission(school_id,'fees.read'));
CREATE POLICY fee_structures_insert ON public.fee_structures FOR INSERT TO authenticated WITH CHECK(private.has_school_permission(school_id,'fees.manage'));
CREATE POLICY fee_structures_update ON public.fee_structures FOR UPDATE TO authenticated USING(private.has_school_permission(school_id,'fees.manage')) WITH CHECK(private.has_school_permission(school_id,'fees.manage'));
CREATE POLICY invoices_select ON public.invoices FOR SELECT TO authenticated USING(private.has_school_permission(school_id,'fees.read'));
CREATE POLICY invoices_insert ON public.invoices FOR INSERT TO authenticated WITH CHECK(private.has_school_permission(school_id,'fees.manage'));
CREATE POLICY invoices_update ON public.invoices FOR UPDATE TO authenticated USING(private.has_school_permission(school_id,'fees.manage')) WITH CHECK(private.has_school_permission(school_id,'fees.manage'));
CREATE POLICY invoice_lines_select ON public.invoice_lines FOR SELECT TO authenticated USING(private.has_school_permission(school_id,'fees.read'));
CREATE POLICY invoice_lines_insert ON public.invoice_lines FOR INSERT TO authenticated WITH CHECK(private.has_school_permission(school_id,'fees.manage'));
CREATE POLICY payments_select ON public.payments FOR SELECT TO authenticated USING(private.has_school_permission(school_id,'fees.read'));
CREATE POLICY payments_insert ON public.payments FOR INSERT TO authenticated WITH CHECK(private.has_school_permission(school_id,'fees.manage'));
CREATE POLICY expenses_select ON public.expenses FOR SELECT TO authenticated USING(private.has_school_permission(school_id,'fees.read'));
CREATE POLICY expenses_insert ON public.expenses FOR INSERT TO authenticated WITH CHECK(private.has_school_permission(school_id,'fees.manage'));
COMMIT;
