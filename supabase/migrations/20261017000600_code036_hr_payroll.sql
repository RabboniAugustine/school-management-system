-- CODE 036: Staff leave requests and monthly payroll (compensation is restricted to payroll roles).
BEGIN;
CREATE TABLE public.leave_requests (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 school_id uuid NOT NULL REFERENCES public.schools(id) ON DELETE RESTRICT,
 staff_id uuid NOT NULL,
 leave_type text NOT NULL CHECK(leave_type IN ('annual','sick','maternity','paternity','study','unpaid','other')),
 starts_on date NOT NULL,
 ends_on date NOT NULL,
 reason text CHECK(reason IS NULL OR char_length(reason)<=500),
 status text NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','approved','rejected','cancelled')),
 decided_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
 decided_at timestamptz,
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now(),
 CHECK(ends_on >= starts_on),
 FOREIGN KEY(school_id,staff_id) REFERENCES public.staff_members(school_id,id) ON DELETE RESTRICT
);

-- True when the staff record belongs to the signed-in user. SECURITY DEFINER so it works even for
-- roles that cannot read the staff directory themselves.
CREATE OR REPLACE FUNCTION private.is_own_staff(p_school_id uuid, p_staff_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
 SELECT EXISTS(SELECT 1 FROM public.staff_members s WHERE s.id=p_staff_id AND s.school_id=p_school_id AND s.user_id=(SELECT auth.uid()));
$$;
REVOKE ALL ON FUNCTION private.is_own_staff(uuid,uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION private.is_own_staff(uuid,uuid) TO authenticated;

CREATE INDEX leave_requests_staff_idx ON public.leave_requests(school_id,staff_id,starts_on);
CREATE TRIGGER leave_requests_updated BEFORE UPDATE ON public.leave_requests FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Decisions are stamped by the database, and a decided request cannot be re-decided.
CREATE OR REPLACE FUNCTION private.guard_leave_update()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
 IF OLD.status <> 'pending' THEN RAISE EXCEPTION 'Leave request is already %', OLD.status USING ERRCODE='23514'; END IF;
 IF NEW.status IN ('approved','rejected') THEN
  IF NOT private.has_school_permission(OLD.school_id,'hr.manage') THEN RAISE EXCEPTION 'Only HR managers can decide leave' USING ERRCODE='42501'; END IF;
  NEW.decided_by := auth.uid(); NEW.decided_at := now();
 END IF;
 RETURN NEW;
END; $$;
CREATE TRIGGER leave_requests_guard BEFORE UPDATE ON public.leave_requests FOR EACH ROW EXECUTE FUNCTION private.guard_leave_update();

CREATE TABLE public.staff_compensation (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 school_id uuid NOT NULL REFERENCES public.schools(id) ON DELETE RESTRICT,
 staff_id uuid NOT NULL,
 basic_pesewas bigint NOT NULL CHECK(basic_pesewas >= 0 AND basic_pesewas < 100000000000),
 allowances_pesewas bigint NOT NULL DEFAULT 0 CHECK(allowances_pesewas >= 0),
 deductions_pesewas bigint NOT NULL DEFAULT 0 CHECK(deductions_pesewas >= 0),
 updated_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(school_id,staff_id),
 FOREIGN KEY(school_id,staff_id) REFERENCES public.staff_members(school_id,id) ON DELETE RESTRICT
);
CREATE TRIGGER staff_compensation_updated BEFORE UPDATE ON public.staff_compensation FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE public.payroll_runs (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 school_id uuid NOT NULL REFERENCES public.schools(id) ON DELETE RESTRICT,
 period_month date NOT NULL CHECK(period_month = date_trunc('month', period_month)::date),
 status text NOT NULL DEFAULT 'draft' CHECK(status IN ('draft','approved','paid')),
 approved_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(school_id,id), UNIQUE(school_id,period_month)
);
CREATE TRIGGER payroll_runs_updated BEFORE UPDATE ON public.payroll_runs FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE public.payslips (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 school_id uuid NOT NULL REFERENCES public.schools(id) ON DELETE RESTRICT,
 run_id uuid NOT NULL,
 staff_id uuid NOT NULL,
 basic_pesewas bigint NOT NULL CHECK(basic_pesewas >= 0),
 allowances_pesewas bigint NOT NULL DEFAULT 0 CHECK(allowances_pesewas >= 0),
 deductions_pesewas bigint NOT NULL DEFAULT 0 CHECK(deductions_pesewas >= 0),
 net_pesewas bigint GENERATED ALWAYS AS (basic_pesewas + allowances_pesewas - deductions_pesewas) STORED,
 created_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(school_id,run_id,staff_id),
 CHECK(basic_pesewas + allowances_pesewas - deductions_pesewas >= 0),
 FOREIGN KEY(school_id,run_id) REFERENCES public.payroll_runs(school_id,id) ON DELETE RESTRICT,
 FOREIGN KEY(school_id,staff_id) REFERENCES public.staff_members(school_id,id) ON DELETE RESTRICT
);

-- Payslips are editable only while their run is a draft; run status only moves forward.
CREATE OR REPLACE FUNCTION private.guard_payslip()
RETURNS trigger LANGUAGE plpgsql SET search_path = '' AS $$
DECLARE v_status text;
BEGIN
 SELECT status INTO v_status FROM public.payroll_runs WHERE id=COALESCE(NEW.run_id,OLD.run_id) AND school_id=COALESCE(NEW.school_id,OLD.school_id);
 IF v_status <> 'draft' THEN RAISE EXCEPTION 'Payroll run is %, payslips are locked', v_status USING ERRCODE='23514'; END IF;
 RETURN COALESCE(NEW,OLD);
END; $$;
CREATE TRIGGER payslips_guard BEFORE INSERT OR UPDATE OR DELETE ON public.payslips FOR EACH ROW EXECUTE FUNCTION private.guard_payslip();

CREATE OR REPLACE FUNCTION private.guard_payroll_run()
RETURNS trigger LANGUAGE plpgsql SET search_path = '' AS $$
BEGIN
 IF NOT ((OLD.status='draft' AND NEW.status IN ('draft','approved')) OR (OLD.status='approved' AND NEW.status IN ('approved','paid')) OR OLD.status=NEW.status) THEN
  RAISE EXCEPTION 'Invalid payroll status change from % to %', OLD.status, NEW.status USING ERRCODE='23514';
 END IF;
 IF NEW.status='approved' AND OLD.status='draft' THEN NEW.approved_by := auth.uid(); END IF;
 RETURN NEW;
END; $$;
CREATE TRIGGER payroll_runs_guard BEFORE UPDATE ON public.payroll_runs FOR EACH ROW EXECUTE FUNCTION private.guard_payroll_run();

CREATE OR REPLACE FUNCTION public.create_payroll_run(p_school_id uuid, p_month date)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_run uuid; v_month date := date_trunc('month', p_month)::date;
BEGIN
 IF NOT private.has_school_permission(p_school_id,'payroll.manage') THEN RAISE EXCEPTION 'Not allowed' USING ERRCODE='42501'; END IF;
 INSERT INTO public.payroll_runs(school_id,period_month) VALUES(p_school_id,v_month) RETURNING id INTO v_run;
 INSERT INTO public.payslips(school_id,run_id,staff_id,basic_pesewas,allowances_pesewas,deductions_pesewas)
 SELECT p_school_id,v_run,c.staff_id,c.basic_pesewas,c.allowances_pesewas,c.deductions_pesewas
 FROM public.staff_compensation c JOIN public.staff_members s ON s.id=c.staff_id AND s.school_id=c.school_id
 WHERE c.school_id=p_school_id AND s.status IN ('active','on_leave');
 RETURN v_run;
END; $$;
REVOKE ALL ON FUNCTION public.create_payroll_run(uuid,date) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.create_payroll_run(uuid,date) TO authenticated;

INSERT INTO public.permissions(code,name,description) VALUES
 ('hr.read','View leave','View staff leave requests'),
 ('hr.manage','Manage leave','Approve or reject staff leave'),
 ('payroll.read','View payroll','View staff compensation and payslips'),
 ('payroll.manage','Manage payroll','Set compensation and run payroll'),
 ('leave.request','Request own leave','File and cancel your own leave requests')
ON CONFLICT(code) DO NOTHING;
INSERT INTO public.role_permissions(role_id,permission_id)
SELECT r.id,p.id FROM (VALUES
 ('proprietor','hr.read'),('proprietor','hr.manage'),('proprietor','payroll.read'),('proprietor','payroll.manage'),
 ('school_admin','hr.read'),('school_admin','hr.manage'),('school_admin','payroll.read'),('school_admin','payroll.manage'),
 ('head_teacher','hr.read'),('head_teacher','hr.manage'),
 ('bursar','payroll.read'),('bursar','payroll.manage'),
 ('proprietor','leave.request'),('school_admin','leave.request'),('head_teacher','leave.request'),
 ('teacher','leave.request'),('bursar','leave.request'),('librarian','leave.request')
) v(role_code,permission_code)
JOIN public.roles r ON r.code=v.role_code JOIN public.permissions p ON p.code=v.permission_code
ON CONFLICT(role_id,permission_id) DO NOTHING;

ALTER TABLE public.leave_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.staff_compensation ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payroll_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payslips ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.leave_requests,public.staff_compensation,public.payroll_runs,public.payslips FROM PUBLIC,anon,authenticated;
GRANT SELECT ON public.leave_requests,public.staff_compensation,public.payroll_runs,public.payslips TO authenticated;
GRANT INSERT(school_id,staff_id,leave_type,starts_on,ends_on,reason) ON public.leave_requests TO authenticated;
GRANT UPDATE(status) ON public.leave_requests TO authenticated;
GRANT INSERT(school_id,staff_id,basic_pesewas,allowances_pesewas,deductions_pesewas) ON public.staff_compensation TO authenticated;
GRANT UPDATE(basic_pesewas,allowances_pesewas,deductions_pesewas) ON public.staff_compensation TO authenticated;
GRANT UPDATE(status) ON public.payroll_runs TO authenticated;
GRANT UPDATE(allowances_pesewas,deductions_pesewas) ON public.payslips TO authenticated;

-- Staff can file and see their own leave; HR sees everyone's. Own = staff row linked to the signed-in user.
CREATE POLICY leave_select ON public.leave_requests FOR SELECT TO authenticated USING(
 private.has_school_permission(school_id,'hr.read')
 OR private.is_own_staff(school_id,staff_id));
CREATE POLICY leave_insert ON public.leave_requests FOR INSERT TO authenticated WITH CHECK(
 status='pending' AND (private.has_school_permission(school_id,'hr.manage')
 OR private.is_own_staff(school_id,staff_id)));
CREATE POLICY leave_update ON public.leave_requests FOR UPDATE TO authenticated USING(
 private.has_school_permission(school_id,'hr.manage')
 OR private.is_own_staff(school_id,staff_id))
 WITH CHECK(private.has_school_permission(school_id,'hr.manage') OR status IN ('pending','cancelled'));
CREATE POLICY comp_select ON public.staff_compensation FOR SELECT TO authenticated USING(private.has_school_permission(school_id,'payroll.read'));
CREATE POLICY comp_insert ON public.staff_compensation FOR INSERT TO authenticated WITH CHECK(private.has_school_permission(school_id,'payroll.manage'));
CREATE POLICY comp_update ON public.staff_compensation FOR UPDATE TO authenticated USING(private.has_school_permission(school_id,'payroll.manage')) WITH CHECK(private.has_school_permission(school_id,'payroll.manage'));
CREATE POLICY runs_select ON public.payroll_runs FOR SELECT TO authenticated USING(private.has_school_permission(school_id,'payroll.read'));
CREATE POLICY runs_update ON public.payroll_runs FOR UPDATE TO authenticated USING(private.has_school_permission(school_id,'payroll.manage')) WITH CHECK(private.has_school_permission(school_id,'payroll.manage'));
CREATE POLICY slips_select ON public.payslips FOR SELECT TO authenticated USING(private.has_school_permission(school_id,'payroll.read'));
CREATE POLICY slips_update ON public.payslips FOR UPDATE TO authenticated USING(private.has_school_permission(school_id,'payroll.manage')) WITH CHECK(private.has_school_permission(school_id,'payroll.manage'));
COMMIT;
