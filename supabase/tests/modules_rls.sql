-- Behavioural tests for CODE 031-037. Run against a database where all migrations are applied:
--   psql -v ON_ERROR_STOP=1 -f supabase/tests/modules_rls.sql
-- Everything runs in one transaction that is rolled back at the end.
BEGIN;
CREATE SCHEMA t;
CREATE FUNCTION t.act(uid uuid) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
 PERFORM set_config('request.jwt.claim.sub', COALESCE(uid::text,''), true);
 EXECUTE 'RESET ROLE'; EXECUTE 'SET LOCAL ROLE authenticated';
END $$;
CREATE FUNCTION t.svc() RETURNS void LANGUAGE plpgsql AS $$ BEGIN EXECUTE 'RESET ROLE'; EXECUTE 'SET LOCAL ROLE service_role'; END $$;
CREATE FUNCTION t.root() RETURNS void LANGUAGE plpgsql AS $$ BEGIN EXECUTE 'RESET ROLE'; END $$;
CREATE FUNCTION t.cnt(q text, expected int, label text) RETURNS void LANGUAGE plpgsql AS $$
DECLARE n int;
BEGIN EXECUTE 'SELECT count(*) FROM ('||q||') s' INTO n;
 IF n <> expected THEN RAISE EXCEPTION 'FAIL %: expected % rows, got %', label, expected, n; END IF;
 RAISE NOTICE 'ok   %', label; END $$;
CREATE FUNCTION t.fails(q text, label text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
 BEGIN EXECUTE q; EXCEPTION WHEN OTHERS THEN RAISE NOTICE 'ok   % (%)', label, left(SQLERRM,70); RETURN; END;
 RAISE EXCEPTION 'FAIL %: statement should have been rejected', label; END $$;
CREATE FUNCTION t.noeffect(q text, label text) RETURNS void LANGUAGE plpgsql AS $$
DECLARE n bigint;
BEGIN
 BEGIN EXECUTE q; GET DIAGNOSTICS n = ROW_COUNT;
 EXCEPTION WHEN OTHERS THEN RAISE NOTICE 'ok   % (rejected)', label; RETURN; END;
 IF n > 0 THEN RAISE EXCEPTION 'FAIL %: % rows were changed', label, n; END IF;
 RAISE NOTICE 'ok   % (0 rows affected)', label; END $$;
GRANT USAGE ON SCHEMA t TO authenticated, service_role; GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA t TO authenticated, service_role;

-- ---------- seed (as superuser) ----------
INSERT INTO auth.users(id,email) VALUES
 ('00000000-0000-0000-0000-0000000000a1','admin.a@t.dev'),('00000000-0000-0000-0000-0000000000a2','bursar.a@t.dev'),
 ('00000000-0000-0000-0000-0000000000a3','teacher.a@t.dev'),('00000000-0000-0000-0000-0000000000a4','parent1@t.dev'),
 ('00000000-0000-0000-0000-0000000000a5','parent2@t.dev'),('00000000-0000-0000-0000-0000000000b1','bursar.b@t.dev');
INSERT INTO public.users(id) SELECT id FROM auth.users ON CONFLICT DO NOTHING;
INSERT INTO public.schools(id,name,slug,status) VALUES
 ('10000000-0000-0000-0000-00000000000a','School A','school-a','active'),('10000000-0000-0000-0000-00000000000b','School B','school-b','active');
INSERT INTO public.branches(id,school_id,name,code,is_main) VALUES
 ('20000000-0000-0000-0000-00000000000a','10000000-0000-0000-0000-00000000000a','Main','MAIN',true),
 ('20000000-0000-0000-0000-00000000000b','10000000-0000-0000-0000-00000000000b','Main','MAIN',true);
CREATE TEMP TABLE m(uid uuid, sid uuid, role text);
INSERT INTO m VALUES
 ('00000000-0000-0000-0000-0000000000a1','10000000-0000-0000-0000-00000000000a','school_admin'),
 ('00000000-0000-0000-0000-0000000000a2','10000000-0000-0000-0000-00000000000a','bursar'),
 ('00000000-0000-0000-0000-0000000000a3','10000000-0000-0000-0000-00000000000a','teacher'),
 ('00000000-0000-0000-0000-0000000000a4','10000000-0000-0000-0000-00000000000a','parent'),
 ('00000000-0000-0000-0000-0000000000a5','10000000-0000-0000-0000-00000000000a','parent'),
 ('00000000-0000-0000-0000-0000000000b1','10000000-0000-0000-0000-00000000000b','bursar');
INSERT INTO public.school_memberships(school_id,user_id,status,joined_at) SELECT sid,uid,'active',now() FROM m;
INSERT INTO public.user_roles(school_id,membership_id,role_id)
 SELECT m.sid,sm.id,r.id FROM m JOIN public.school_memberships sm ON sm.user_id=m.uid AND sm.school_id=m.sid JOIN public.roles r ON r.code=m.role;
INSERT INTO public.academic_years(id,school_id,name,starts_on,ends_on,status) VALUES
 ('30000000-0000-0000-0000-00000000000a','10000000-0000-0000-0000-00000000000a','2026/2027','2026-09-01','2027-07-31','active');
INSERT INTO public.terms(id,school_id,academic_year_id,name,term_number,starts_on,ends_on,status) VALUES
 ('31000000-0000-0000-0000-00000000000a','10000000-0000-0000-0000-00000000000a','30000000-0000-0000-0000-00000000000a','Term 1',1,'2026-09-01','2026-12-15','active');
INSERT INTO public.school_classes(id,school_id,branch_id,name,code) VALUES
 ('40000000-0000-0000-0000-00000000000a','10000000-0000-0000-0000-00000000000a','20000000-0000-0000-0000-00000000000a','Basic 1','B1'),
 ('40000000-0000-0000-0000-00000000000b','10000000-0000-0000-0000-00000000000a','20000000-0000-0000-0000-00000000000a','Basic 2','B2');
INSERT INTO public.school_subjects(id,school_id,code,name) VALUES
 ('50000000-0000-0000-0000-00000000000a','10000000-0000-0000-0000-00000000000a','MATH','Mathematics'),
 ('50000000-0000-0000-0000-00000000000b','10000000-0000-0000-0000-00000000000a','ENG','English');
INSERT INTO public.class_subjects(school_id,class_id,subject_id) VALUES
 ('10000000-0000-0000-0000-00000000000a','40000000-0000-0000-0000-00000000000a','50000000-0000-0000-0000-00000000000a'),
 ('10000000-0000-0000-0000-00000000000a','40000000-0000-0000-0000-00000000000a','50000000-0000-0000-0000-00000000000b'),
 ('10000000-0000-0000-0000-00000000000a','40000000-0000-0000-0000-00000000000b','50000000-0000-0000-0000-00000000000a');
INSERT INTO public.students(id,school_id,branch_id,admission_number,first_name,last_name) VALUES
 ('60000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-00000000000a','20000000-0000-0000-0000-00000000000a','A-001','Ama','Mensah'),
 ('60000000-0000-0000-0000-000000000002','10000000-0000-0000-0000-00000000000a','20000000-0000-0000-0000-00000000000a','A-002','Kofi','Boateng'),
 ('60000000-0000-0000-0000-000000000003','10000000-0000-0000-0000-00000000000a','20000000-0000-0000-0000-00000000000a','A-003','Yaa','Owusu');
INSERT INTO public.student_guardians(school_id,student_id,full_name,relationship,phone,is_primary) VALUES
 ('10000000-0000-0000-0000-00000000000a','60000000-0000-0000-0000-000000000001','Esi Mensah','mother','0241234567',true),
 ('10000000-0000-0000-0000-00000000000a','60000000-0000-0000-0000-000000000002','Yaw Boateng','father','0207654321',true);
INSERT INTO public.student_enrollments(id,school_id,student_id,academic_year_id,class_id) VALUES
 ('70000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-00000000000a','60000000-0000-0000-0000-000000000001','30000000-0000-0000-0000-00000000000a','40000000-0000-0000-0000-00000000000a'),
 ('70000000-0000-0000-0000-000000000002','10000000-0000-0000-0000-00000000000a','60000000-0000-0000-0000-000000000002','30000000-0000-0000-0000-00000000000a','40000000-0000-0000-0000-00000000000a'),
 ('70000000-0000-0000-0000-000000000003','10000000-0000-0000-0000-00000000000a','60000000-0000-0000-0000-000000000003','30000000-0000-0000-0000-00000000000a','40000000-0000-0000-0000-00000000000b');
INSERT INTO public.student_attendance(school_id,enrollment_id,school_day,status) VALUES
 ('10000000-0000-0000-0000-00000000000a','70000000-0000-0000-0000-000000000001','2026-10-05','absent'),
 ('10000000-0000-0000-0000-00000000000a','70000000-0000-0000-0000-000000000002','2026-10-05','present');
INSERT INTO public.staff_members(id,school_id,branch_id,employee_number,first_name,last_name,job_title,user_id) VALUES
 ('80000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-00000000000a','20000000-0000-0000-0000-00000000000a','E-01','Tina','Teacher','Teacher','00000000-0000-0000-0000-0000000000a3'),
 ('80000000-0000-0000-0000-000000000002','10000000-0000-0000-0000-00000000000a','20000000-0000-0000-0000-00000000000a','E-02','Sam','Staff','Teacher',NULL);
INSERT INTO public.portal_links(school_id,user_id,student_id,relation) VALUES
 ('10000000-0000-0000-0000-00000000000a','00000000-0000-0000-0000-0000000000a4','60000000-0000-0000-0000-000000000001','parent'),
 ('10000000-0000-0000-0000-00000000000a','00000000-0000-0000-0000-0000000000a5','60000000-0000-0000-0000-000000000002','parent');

-- ---------- FEES ----------
SELECT t.act('00000000-0000-0000-0000-0000000000a2');
INSERT INTO public.fee_structures(school_id,academic_year_id,name,amount_pesewas) VALUES
 ('10000000-0000-0000-0000-00000000000a','30000000-0000-0000-0000-00000000000a','Tuition',50000),
 ('10000000-0000-0000-0000-00000000000a','30000000-0000-0000-0000-00000000000a','PTA levy',5000);
SELECT t.cnt($$SELECT public.generate_term_invoices('10000000-0000-0000-0000-00000000000a','30000000-0000-0000-0000-00000000000a','31000000-0000-0000-0000-00000000000a') FROM generate_series(1,1) WHERE false$$,0,'noop');
DO $$ DECLARE n int; BEGIN
 n := public.generate_term_invoices('10000000-0000-0000-0000-00000000000a','30000000-0000-0000-0000-00000000000a','31000000-0000-0000-0000-00000000000a');
 IF n <> 3 THEN RAISE EXCEPTION 'FAIL generate invoices: expected 3 got %', n; END IF; RAISE NOTICE 'ok   generated % invoices', n;
 n := public.generate_term_invoices('10000000-0000-0000-0000-00000000000a','30000000-0000-0000-0000-00000000000a','31000000-0000-0000-0000-00000000000a');
 IF n <> 0 THEN RAISE EXCEPTION 'FAIL re-run must not double bill, got %', n; END IF; RAISE NOTICE 'ok   re-run created 0 invoices';
END $$;
SELECT t.cnt($$SELECT 1 FROM public.invoice_balances WHERE total_pesewas=55000$$,3,'each invoice totals GHS 550.00');
DO $$ DECLARE inv uuid; BEGIN
 SELECT invoice_id INTO inv FROM public.invoice_balances WHERE student_id='60000000-0000-0000-0000-000000000001';
 INSERT INTO public.payments(school_id,invoice_id,receipt_number,amount_pesewas,method) VALUES('10000000-0000-0000-0000-00000000000a',inv,'RCT-1',20000,'mobile_money');
 PERFORM t.fails(format($f$INSERT INTO public.payments(school_id,invoice_id,receipt_number,amount_pesewas,method) VALUES('10000000-0000-0000-0000-00000000000a',%L,'RCT-2',40000,'cash')$f$,inv),'overpayment rejected');
 PERFORM t.fails('UPDATE public.payments SET amount_pesewas=1','payments cannot be edited');
 PERFORM t.fails('DELETE FROM public.payments','payments cannot be deleted');
END $$;
SELECT t.cnt($$SELECT 1 FROM public.invoice_balances WHERE paid_pesewas=20000$$,1,'balance view reflects the payment');
SELECT t.act('00000000-0000-0000-0000-0000000000a3');
SELECT t.cnt('SELECT 1 FROM public.invoices',0,'teacher cannot see invoices');
SELECT t.cnt('SELECT 1 FROM public.payments',0,'teacher cannot see payments');
SELECT t.fails($$INSERT INTO public.expenses(school_id,category,description,amount_pesewas) VALUES('10000000-0000-0000-0000-00000000000a','x1','teacher spend',100)$$,'teacher cannot record expenses');
SELECT t.fails($$SELECT public.generate_term_invoices('10000000-0000-0000-0000-00000000000a','30000000-0000-0000-0000-00000000000a','31000000-0000-0000-0000-00000000000a')$$,'teacher cannot bill');
SELECT t.act('00000000-0000-0000-0000-0000000000b1');
SELECT t.cnt('SELECT 1 FROM public.invoices',0,'other school bursar sees nothing');
SELECT t.fails($$INSERT INTO public.fee_structures(school_id,academic_year_id,name,amount_pesewas) VALUES('10000000-0000-0000-0000-00000000000a','30000000-0000-0000-0000-00000000000a','Hack',1)$$,'cross-school insert blocked');

-- ---------- PORTAL ----------
SELECT t.act('00000000-0000-0000-0000-0000000000a4');
SELECT t.cnt('SELECT 1 FROM public.students',1,'parent sees only their child');
SELECT t.cnt('SELECT 1 FROM public.invoices',1,'parent sees only their child invoice');
SELECT t.cnt('SELECT 1 FROM public.payments',1,'parent sees their child payment');
SELECT t.cnt('SELECT 1 FROM public.student_attendance',1,'parent sees their child attendance');
SELECT t.cnt('SELECT 1 FROM public.student_guardians',0,'parent cannot read guardian contacts');
SELECT t.cnt('SELECT 1 FROM public.fee_structures',0,'parent cannot read fee structures');
SELECT t.noeffect($$UPDATE public.students SET first_name='X'$$,'parent cannot edit students');
SELECT t.act('00000000-0000-0000-0000-0000000000a5');
SELECT t.cnt('SELECT 1 FROM public.invoices',1,'second parent sees one invoice');
SELECT t.cnt($$SELECT 1 FROM public.invoices WHERE student_id='60000000-0000-0000-0000-000000000001'$$,0,'second parent cannot see first child');

-- ---------- GRADES ----------
SELECT t.act('00000000-0000-0000-0000-0000000000a3');
SELECT public.load_default_grading_scale('10000000-0000-0000-0000-00000000000a');
SELECT t.fails($$SELECT public.load_default_grading_scale('10000000-0000-0000-0000-00000000000a')$$,'default scale loads only once');
SELECT t.fails($$INSERT INTO public.grading_scales(school_id,grade,min_score,max_score,remark) VALUES('10000000-0000-0000-0000-00000000000a','Z',75,85,'Overlap')$$,'overlapping grade band rejected');
INSERT INTO public.assessments(school_id,term_id,class_id,subject_id,name,max_score,weight_percent) VALUES
 ('10000000-0000-0000-0000-00000000000a','31000000-0000-0000-0000-00000000000a','40000000-0000-0000-0000-00000000000a','50000000-0000-0000-0000-00000000000a','Class test',20,30);
SELECT t.fails($$INSERT INTO public.assessments(school_id,term_id,class_id,subject_id,name,max_score,weight_percent) VALUES('10000000-0000-0000-0000-00000000000a','31000000-0000-0000-0000-00000000000a','40000000-0000-0000-0000-00000000000a','50000000-0000-0000-0000-00000000000a','Exam',100,80)$$,'weights above 100% rejected');
INSERT INTO public.assessments(school_id,term_id,class_id,subject_id,name,kind,max_score,weight_percent) VALUES
 ('10000000-0000-0000-0000-00000000000a','31000000-0000-0000-0000-00000000000a','40000000-0000-0000-0000-00000000000a','50000000-0000-0000-0000-00000000000a','Exam','exam',100,70);
INSERT INTO public.scores(school_id,assessment_id,enrollment_id,score) VALUES
 ('10000000-0000-0000-0000-00000000000a',(SELECT id FROM public.assessments WHERE name='Class test'),'70000000-0000-0000-0000-000000000001',18),
 ('10000000-0000-0000-0000-00000000000a',(SELECT id FROM public.assessments WHERE name='Exam'),'70000000-0000-0000-0000-000000000001',80),
 ('10000000-0000-0000-0000-00000000000a',(SELECT id FROM public.assessments WHERE name='Class test'),'70000000-0000-0000-0000-000000000002',10),
 ('10000000-0000-0000-0000-00000000000a',(SELECT id FROM public.assessments WHERE name='Exam'),'70000000-0000-0000-0000-000000000002',50);
SELECT t.fails($$INSERT INTO public.scores(school_id,assessment_id,enrollment_id,score) VALUES('10000000-0000-0000-0000-00000000000a',(SELECT id FROM public.assessments WHERE name='Class test'),'70000000-0000-0000-0000-000000000003',5)$$,'score for a student of another class rejected');
SELECT t.fails($$UPDATE public.scores SET score=21 WHERE assessment_id=(SELECT id FROM public.assessments WHERE name='Class test')$$,'score above maximum rejected');
SELECT t.cnt($$SELECT 1 FROM public.subject_results WHERE enrollment_id='70000000-0000-0000-0000-000000000001' AND total_percent=83.00 AND grade='A1'$$,1,'weighted result 18/20*30 + 80/100*70 = 83.00 (A1)');
SELECT t.cnt($$SELECT 1 FROM public.term_rankings WHERE enrollment_id='70000000-0000-0000-0000-000000000001' AND position=1 AND class_size=2$$,1,'top student ranks 1 of 2');
SELECT t.cnt($$SELECT 1 FROM public.term_rankings WHERE enrollment_id='70000000-0000-0000-0000-000000000002' AND position=2$$,1,'second student ranks 2');
SELECT t.act('00000000-0000-0000-0000-0000000000a4');
SELECT t.cnt($$SELECT 1 FROM public.subject_results$$,1,'parent sees only their child results');
SELECT t.cnt($$SELECT 1 FROM public.scores$$,2,'parent sees their child scores');
SELECT t.act('00000000-0000-0000-0000-0000000000a3');
UPDATE public.assessments SET is_locked=true WHERE id=(SELECT id FROM public.assessments WHERE name='Class test');
SELECT t.fails($$UPDATE public.scores SET score=19 WHERE assessment_id=(SELECT id FROM public.assessments WHERE name='Class test')$$,'locked assessment rejects score edits');

-- ---------- TIMETABLE ----------
SELECT t.act('00000000-0000-0000-0000-0000000000a1');
INSERT INTO public.timetable_periods(school_id,name,starts_at,ends_at,sort_order) VALUES
 ('10000000-0000-0000-0000-00000000000a','Period 1','08:00','08:40',1);
INSERT INTO public.timetable_slots(school_id,academic_year_id,class_id,subject_id,staff_id,period_id,day_of_week,room) VALUES
 ('10000000-0000-0000-0000-00000000000a','30000000-0000-0000-0000-00000000000a','40000000-0000-0000-0000-00000000000a','50000000-0000-0000-0000-00000000000a','80000000-0000-0000-0000-000000000001',(SELECT id FROM public.timetable_periods WHERE name='Period 1'),1,'Room 1');
SELECT t.fails($$INSERT INTO public.timetable_slots(school_id,academic_year_id,class_id,subject_id,staff_id,period_id,day_of_week,room) VALUES('10000000-0000-0000-0000-00000000000a','30000000-0000-0000-0000-00000000000a','40000000-0000-0000-0000-00000000000b','50000000-0000-0000-0000-00000000000a','80000000-0000-0000-0000-000000000001',(SELECT id FROM public.timetable_periods WHERE name='Period 1'),1,'Room 2')$$,'teacher double-booking rejected');
SELECT t.fails($$INSERT INTO public.timetable_slots(school_id,academic_year_id,class_id,subject_id,staff_id,period_id,day_of_week,room) VALUES('10000000-0000-0000-0000-00000000000a','30000000-0000-0000-0000-00000000000a','40000000-0000-0000-0000-00000000000b','50000000-0000-0000-0000-00000000000a','80000000-0000-0000-0000-000000000002',(SELECT id FROM public.timetable_periods WHERE name='Period 1'),1,'room 1')$$,'room double-booking rejected');
SELECT t.fails($$INSERT INTO public.timetable_slots(school_id,academic_year_id,class_id,subject_id,period_id,day_of_week) VALUES('10000000-0000-0000-0000-00000000000a','30000000-0000-0000-0000-00000000000a','40000000-0000-0000-0000-00000000000b','50000000-0000-0000-0000-00000000000b',(SELECT id FROM public.timetable_periods WHERE name='Period 1'),2)$$,'subject not taught in class rejected');

-- ---------- LIBRARY ----------
INSERT INTO public.library_books(school_id,title,copies_total) VALUES('10000000-0000-0000-0000-00000000000a','Things Fall Apart',1);
INSERT INTO public.library_loans(school_id,book_id,student_id,due_on) VALUES('10000000-0000-0000-0000-00000000000a',(SELECT id FROM public.library_books WHERE title='Things Fall Apart'),'60000000-0000-0000-0000-000000000001',CURRENT_DATE+14);
SELECT t.fails($$INSERT INTO public.library_loans(school_id,book_id,student_id,due_on) VALUES('10000000-0000-0000-0000-00000000000a',(SELECT id FROM public.library_books WHERE title='Things Fall Apart'),'60000000-0000-0000-0000-000000000002',CURRENT_DATE+14)$$,'last copy cannot be lent twice');
UPDATE public.library_loans SET returned_on=CURRENT_DATE;
INSERT INTO public.library_loans(school_id,book_id,student_id,due_on) VALUES('10000000-0000-0000-0000-00000000000a',(SELECT id FROM public.library_books WHERE title='Things Fall Apart'),'60000000-0000-0000-0000-000000000002',CURRENT_DATE+14);
SELECT t.fails($$INSERT INTO public.library_loans(school_id,book_id,due_on) VALUES('10000000-0000-0000-0000-00000000000a',(SELECT id FROM public.library_books WHERE title='Things Fall Apart'),CURRENT_DATE+1)$$,'loan needs exactly one borrower');

-- ---------- COMMUNICATION ----------
DO $$ DECLARE n int; BEGIN
 n := public.queue_absence_alerts('10000000-0000-0000-0000-00000000000a','2026-10-05');
 IF n <> 1 THEN RAISE EXCEPTION 'FAIL absence alerts: expected 1 got %', n; END IF; RAISE NOTICE 'ok   absence alert queued for the absent student only';
 n := public.queue_absence_alerts('10000000-0000-0000-0000-00000000000a','2026-10-05');
 IF n <> 0 THEN RAISE EXCEPTION 'FAIL absence alerts must not duplicate, got %', n; END IF; RAISE NOTICE 'ok   no duplicate alert on re-run';
END $$;
SELECT t.cnt($$SELECT 1 FROM public.sms_outbox WHERE kind='absence' AND recipient_phone='0241234567' AND body LIKE '%Ama Mensah%'$$,1,'alert goes to the primary guardian');
SELECT t.act('00000000-0000-0000-0000-0000000000a3');
SELECT t.fails($$SELECT public.queue_absence_alerts('10000000-0000-0000-0000-00000000000a','2026-10-05')$$,'teacher cannot queue SMS');
SELECT t.act('00000000-0000-0000-0000-0000000000a1');
INSERT INTO public.announcements(school_id,title,body,audience) VALUES('10000000-0000-0000-0000-00000000000a','Midterm break','School closes on Friday.','parents'),
 ('10000000-0000-0000-0000-00000000000a','Staff meeting','Staff only.','staff');
SELECT t.act('00000000-0000-0000-0000-0000000000a4');
SELECT t.cnt('SELECT 1 FROM public.announcements',1,'parent sees only parent-audience announcements');
SELECT t.cnt('SELECT 1 FROM public.sms_outbox',0,'parent cannot see the SMS outbox');

-- ---------- PAYROLL / HR ----------
SELECT t.act('00000000-0000-0000-0000-0000000000a2');
INSERT INTO public.staff_compensation(school_id,staff_id,basic_pesewas,allowances_pesewas,deductions_pesewas) VALUES('10000000-0000-0000-0000-00000000000a','80000000-0000-0000-0000-000000000001',300000,20000,35000);
DO $$ DECLARE r uuid; BEGIN r := public.create_payroll_run('10000000-0000-0000-0000-00000000000a','2026-10-17'); END $$;
SELECT t.cnt($$SELECT 1 FROM public.payslips WHERE net_pesewas=285000$$,1,'net pay = basic + allowances - deductions');
SELECT t.fails($$SELECT public.create_payroll_run('10000000-0000-0000-0000-00000000000a','2026-10-02')$$,'one payroll run per month');
UPDATE public.payroll_runs SET status='approved';
SELECT t.fails($$UPDATE public.payslips SET deductions_pesewas=0$$,'payslips locked after approval');
SELECT t.fails($$UPDATE public.payroll_runs SET status='draft'$$,'payroll status cannot move backwards');
SELECT t.act('00000000-0000-0000-0000-0000000000a3');
SELECT t.cnt('SELECT 1 FROM public.staff_compensation',0,'teacher cannot see salaries');
SELECT t.cnt('SELECT 1 FROM public.payslips',0,'teacher cannot see payslips');
INSERT INTO public.leave_requests(school_id,staff_id,leave_type,starts_on,ends_on) VALUES('10000000-0000-0000-0000-00000000000a','80000000-0000-0000-0000-000000000001','annual','2026-11-02','2026-11-06');
SELECT t.fails($$INSERT INTO public.leave_requests(school_id,staff_id,leave_type,starts_on,ends_on) VALUES('10000000-0000-0000-0000-00000000000a','80000000-0000-0000-0000-000000000002','annual','2026-11-02','2026-11-06')$$,'teacher cannot file leave for someone else');
SELECT t.fails($$UPDATE public.leave_requests SET status='approved'$$,'teacher cannot approve own leave');
SELECT t.cnt('SELECT 1 FROM public.leave_requests',1,'teacher sees own leave');
SELECT t.act('00000000-0000-0000-0000-0000000000a1');
UPDATE public.leave_requests SET status='approved';
SELECT t.cnt($$SELECT 1 FROM public.leave_requests WHERE status='approved' AND decided_by IS NOT NULL$$,1,'HR approval is stamped by the database');
SELECT t.fails($$UPDATE public.leave_requests SET status='rejected'$$,'decided leave cannot be changed');

-- ---------- PORTAL LINKING ----------
SELECT public.link_portal_user('10000000-0000-0000-0000-00000000000a','parent1@t.dev','60000000-0000-0000-0000-000000000003','parent');
SELECT t.fails($$SELECT public.link_portal_user('10000000-0000-0000-0000-00000000000a','nobody@t.dev','60000000-0000-0000-0000-000000000003','parent')$$,'linking an unknown email fails clearly');
SELECT t.act('00000000-0000-0000-0000-0000000000a4');
SELECT t.cnt('SELECT 1 FROM public.students',2,'linked parent now sees both children');
SELECT t.fails($$SELECT public.link_portal_user('10000000-0000-0000-0000-00000000000a','parent1@t.dev','60000000-0000-0000-0000-000000000002','parent')$$,'parents cannot link accounts');

-- ---------- REPORTS & HELPERS ----------
SELECT t.act('00000000-0000-0000-0000-0000000000a2');
DO $$ DECLARE r jsonb; BEGIN
 r := public.report_overview('10000000-0000-0000-0000-00000000000a','2026-09-01','2026-12-31');
 IF (r->'finance'->>'collected_pesewas')::bigint <> 20000 THEN RAISE EXCEPTION 'FAIL collected total: %', r->'finance'; END IF;
 IF (r->'finance'->>'outstanding_pesewas')::bigint <> 145000 THEN RAISE EXCEPTION 'FAIL outstanding total: %', r->'finance'; END IF;
 IF NOT (r ? 'grades') THEN RAISE NOTICE 'ok   bursar report omits grades section'; ELSE RAISE EXCEPTION 'FAIL bursar must not see grades'; END IF;
 RAISE NOTICE 'ok   finance totals: collected 200.00, outstanding 1,450.00';
END $$;
SELECT t.act('00000000-0000-0000-0000-0000000000a3');
SELECT t.fails($$SELECT public.report_overview('10000000-0000-0000-0000-00000000000a','2026-09-01','2026-12-31')$$,'teacher cannot open reports');
SELECT t.cnt($$SELECT 1 FROM (SELECT public.my_staff_id('10000000-0000-0000-0000-00000000000a') id) s WHERE id='80000000-0000-0000-0000-000000000001'$$,1,'teacher resolves their own staff id');
SELECT t.act('00000000-0000-0000-0000-0000000000a1');
SELECT t.cnt($$SELECT 1 FROM public.list_portal_links('10000000-0000-0000-0000-00000000000a') WHERE email='parent1@t.dev'$$,2,'admin lists portal links with emails');
SELECT t.act('00000000-0000-0000-0000-0000000000a4');
SELECT t.fails($$SELECT * FROM public.list_portal_links('10000000-0000-0000-0000-00000000000a')$$,'parent cannot list portal links');

-- ---------- TRANSPORT ----------
SELECT t.root();
UPDATE public.students SET gender='female' WHERE id='60000000-0000-0000-0000-000000000001';
UPDATE public.students SET gender='male' WHERE id='60000000-0000-0000-0000-000000000002';
SELECT t.act('00000000-0000-0000-0000-0000000000a1');
INSERT INTO public.transport_routes(school_id,name,fee_pesewas) VALUES('10000000-0000-0000-0000-00000000000a','East route',15000);
INSERT INTO public.transport_vehicles(school_id,route_id,plate_number,capacity) VALUES('10000000-0000-0000-0000-00000000000a',(SELECT id FROM public.transport_routes WHERE name='East route'),'GR-1234-26',1);
INSERT INTO public.student_transport(school_id,student_id,route_id,academic_year_id,pickup_point) VALUES('10000000-0000-0000-0000-00000000000a','60000000-0000-0000-0000-000000000001',(SELECT id FROM public.transport_routes WHERE name='East route'),'30000000-0000-0000-0000-00000000000a','Kasoa junction');
SELECT t.fails($$INSERT INTO public.student_transport(school_id,student_id,route_id,academic_year_id) VALUES('10000000-0000-0000-0000-00000000000a','60000000-0000-0000-0000-000000000002',(SELECT id FROM public.transport_routes WHERE name='East route'),'30000000-0000-0000-0000-00000000000a')$$,'full route rejects another student');
SELECT t.fails($$INSERT INTO public.student_transport(school_id,student_id,route_id,academic_year_id) VALUES('10000000-0000-0000-0000-00000000000a','60000000-0000-0000-0000-000000000001',(SELECT id FROM public.transport_routes WHERE name='East route'),'30000000-0000-0000-0000-00000000000a')$$,'a student has one active route per year');
SELECT t.act('00000000-0000-0000-0000-0000000000a3');
SELECT t.cnt('SELECT 1 FROM public.transport_routes',0,'teacher cannot see transport');
SELECT t.act('00000000-0000-0000-0000-0000000000b1');
SELECT t.cnt('SELECT 1 FROM public.transport_routes',0,'other school cannot see transport');

-- ---------- HOSTEL ----------
SELECT t.act('00000000-0000-0000-0000-0000000000a1');
INSERT INTO public.hostels(school_id,name,gender) VALUES('10000000-0000-0000-0000-00000000000a','Boys house','male');
INSERT INTO public.hostel_rooms(school_id,hostel_id,room_number,capacity) VALUES('10000000-0000-0000-0000-00000000000a',(SELECT id FROM public.hostels WHERE name='Boys house'),'B1',1);
SELECT t.fails($$INSERT INTO public.hostel_allocations(school_id,room_id,student_id,academic_year_id) VALUES('10000000-0000-0000-0000-00000000000a',(SELECT id FROM public.hostel_rooms WHERE room_number='B1'),'60000000-0000-0000-0000-000000000001','30000000-0000-0000-0000-00000000000a')$$,'girl cannot be placed in a boys hostel');
INSERT INTO public.hostel_allocations(school_id,room_id,student_id,academic_year_id) VALUES('10000000-0000-0000-0000-00000000000a',(SELECT id FROM public.hostel_rooms WHERE room_number='B1'),'60000000-0000-0000-0000-000000000002','30000000-0000-0000-0000-00000000000a');
UPDATE public.students SET gender='male' WHERE false;
SELECT t.root(); UPDATE public.students SET gender='male' WHERE id='60000000-0000-0000-0000-000000000003'; SELECT t.act('00000000-0000-0000-0000-0000000000a1');
SELECT t.fails($$INSERT INTO public.hostel_allocations(school_id,room_id,student_id,academic_year_id) VALUES('10000000-0000-0000-0000-00000000000a',(SELECT id FROM public.hostel_rooms WHERE room_number='B1'),'60000000-0000-0000-0000-000000000003','30000000-0000-0000-0000-00000000000a')$$,'full room rejects another student');
UPDATE public.hostel_allocations SET status='ended', ended_on=CURRENT_DATE;
INSERT INTO public.hostel_allocations(school_id,room_id,student_id,academic_year_id) VALUES('10000000-0000-0000-0000-00000000000a',(SELECT id FROM public.hostel_rooms WHERE room_number='B1'),'60000000-0000-0000-0000-000000000003','30000000-0000-0000-0000-00000000000a');
SELECT t.act('00000000-0000-0000-0000-0000000000a4');
SELECT t.cnt('SELECT 1 FROM public.hostel_allocations',0,'parent cannot see hostel allocations');

-- ---------- ONLINE PAYMENTS ----------
SELECT t.act('00000000-0000-0000-0000-0000000000a4');
SELECT t.fails($$SELECT * FROM public.start_online_payment('10000000-0000-0000-0000-00000000000a',(SELECT invoice_id FROM public.invoice_balances WHERE student_id='60000000-0000-0000-0000-000000000001'),10000)$$,'online payment blocked until the school enables it');
SELECT t.act('00000000-0000-0000-0000-0000000000a2');
INSERT INTO public.school_payment_settings(school_id,online_enabled,paystack_subaccount_code) VALUES('10000000-0000-0000-0000-00000000000a',true,'ACCT_abc123xyz');
SELECT t.fails($$INSERT INTO public.school_payment_settings(school_id,online_enabled) VALUES('10000000-0000-0000-0000-00000000000b',true)$$,'cannot enable online payments without a subaccount (and not for another school)');
SELECT t.act('00000000-0000-0000-0000-0000000000a4');
CREATE TEMP TABLE ref1 AS SELECT * FROM public.start_online_payment('10000000-0000-0000-0000-00000000000a',(SELECT invoice_id FROM public.invoice_balances WHERE student_id='60000000-0000-0000-0000-000000000001'),10000);
SELECT t.cnt('SELECT 1 FROM ref1 WHERE amount_pesewas=10000 AND subaccount_code=''ACCT_abc123xyz'' AND reference LIKE ''SMS-%''',1,'parent starts an online payment for their child');
SELECT t.fails($$SELECT * FROM public.start_online_payment('10000000-0000-0000-0000-00000000000a',(SELECT invoice_id FROM public.invoice_balances WHERE student_id='60000000-0000-0000-0000-000000000001'),999999)$$,'cannot pay more than the balance');
SELECT t.fails($$SELECT * FROM public.start_online_payment('10000000-0000-0000-0000-00000000000a',(SELECT invoice_id FROM public.invoice_balances WHERE student_id='60000000-0000-0000-0000-000000000001'),50)$$,'minimum online payment enforced');
SELECT t.act('00000000-0000-0000-0000-0000000000a5');
SELECT t.fails($$SELECT * FROM public.start_online_payment('10000000-0000-0000-0000-00000000000a',(SELECT invoice_id FROM public.invoice_balances WHERE student_id='60000000-0000-0000-0000-000000000001'),10000)$$,'a parent cannot pay for another family''s child');
SELECT t.fails($$SELECT public.apply_online_payment('SMS-x','10000','card','p')$$,'browser users cannot confirm payments');
SELECT t.root(); CREATE TEMP TABLE r1 AS SELECT reference FROM ref1;
GRANT SELECT ON r1 TO service_role;
SELECT t.svc();
DO $$ DECLARE a uuid; b uuid; ref text; BEGIN
 SELECT reference INTO ref FROM r1;
 a := public.apply_online_payment(ref,10000,'mobile_money','PSK-1');
 b := public.apply_online_payment(ref,10000,'mobile_money','PSK-1');
 IF a IS NULL OR a <> b THEN RAISE EXCEPTION 'FAIL apply must be idempotent (% vs %)', a, b; END IF;
 RAISE NOTICE 'ok   verified payment applied once, repeat returns the same payment';
END $$;
SELECT t.root();
SELECT t.cnt($$SELECT 1 FROM public.payments WHERE reference='PSK-1' AND method='mobile_money' AND amount_pesewas=10000 AND received_by IS NULL$$,1,'exactly one payment row was created');
SELECT t.cnt($$SELECT 1 FROM public.invoice_balances WHERE student_id='60000000-0000-0000-0000-000000000001' AND paid_pesewas=30000$$,1,'invoice balance reflects the online payment');
SELECT t.act('00000000-0000-0000-0000-0000000000a4');
CREATE TEMP TABLE ref2 AS SELECT * FROM public.start_online_payment('10000000-0000-0000-0000-00000000000a',(SELECT invoice_id FROM public.invoice_balances WHERE student_id='60000000-0000-0000-0000-000000000001'),5000);
SELECT t.root(); CREATE TEMP TABLE r2 AS SELECT reference FROM ref2; GRANT SELECT ON r2 TO service_role; SELECT t.svc();
DO $$ DECLARE a uuid; BEGIN
 a := public.apply_online_payment((SELECT reference FROM r2),9999,'card','PSK-2');
 IF a IS NOT NULL THEN RAISE EXCEPTION 'FAIL amount mismatch must not create a payment'; END IF;
 RAISE NOTICE 'ok   amount mismatch creates no payment';
END $$;
SELECT t.root();
SELECT t.cnt($$SELECT 1 FROM public.online_payments WHERE status='failed' AND needs_review$$,1,'amount mismatch is flagged for review');
-- invoice settled by cash while an online payment was in flight
SELECT t.act('00000000-0000-0000-0000-0000000000a5');
CREATE TEMP TABLE ref3 AS SELECT * FROM public.start_online_payment('10000000-0000-0000-0000-00000000000a',(SELECT invoice_id FROM public.invoice_balances WHERE student_id='60000000-0000-0000-0000-000000000002'),50000);
SELECT t.act('00000000-0000-0000-0000-0000000000a2');
INSERT INTO public.payments(school_id,invoice_id,receipt_number,amount_pesewas,method) VALUES('10000000-0000-0000-0000-00000000000a',(SELECT invoice_id FROM public.invoice_balances WHERE student_id='60000000-0000-0000-0000-000000000002'),'RCT-CASH',50000,'cash');
SELECT t.root(); CREATE TEMP TABLE r3 AS SELECT reference FROM ref3; GRANT SELECT ON r3 TO service_role; SELECT t.svc();
DO $$ DECLARE a uuid; BEGIN
 a := public.apply_online_payment((SELECT reference FROM r3),50000,'card','PSK-3');
 IF a IS NOT NULL THEN RAISE EXCEPTION 'FAIL overpayment must not be applied'; END IF;
 RAISE NOTICE 'ok   payment arriving after the invoice was settled is not applied';
END $$;
SELECT t.root();
SELECT t.cnt($$SELECT 1 FROM public.online_payments WHERE failure_reason LIKE 'Invoice already settled%' AND needs_review$$,1,'late online payment is flagged for refund');
SELECT t.act('00000000-0000-0000-0000-0000000000a4');
SELECT t.cnt('SELECT 1 FROM public.online_payments',2,'parent sees only their own online payment attempts');

-- ---------- WHATSAPP CHANNEL ----------
SELECT t.act('00000000-0000-0000-0000-0000000000a1');
DO $$ DECLARE n int; BEGIN
 n := public.queue_absence_alerts('10000000-0000-0000-0000-00000000000a','2026-10-05','whatsapp');
 IF n <> 1 THEN RAISE EXCEPTION 'FAIL whatsapp alert expected 1 got %', n; END IF;
 RAISE NOTICE 'ok   the same absence can be alerted once per channel';
END $$;
SELECT t.cnt($$SELECT 1 FROM public.sms_outbox WHERE kind='absence' AND channel='whatsapp'$$,1,'whatsapp message is stored with its channel');
SELECT t.fails($$SELECT public.queue_absence_alerts('10000000-0000-0000-0000-00000000000a','2026-10-05','telegram')$$,'unknown channel rejected');

-- ---------- ACCOUNTING JOURNAL ----------
SELECT t.act('00000000-0000-0000-0000-0000000000a2');
DO $$ DECLARE d bigint; c bigint; n int; BEGIN
 SELECT SUM(debit_pesewas),SUM(credit_pesewas),COUNT(*) INTO d,c,n FROM public.accounting_journal;
 IF d IS NULL OR d <> c THEN RAISE EXCEPTION 'FAIL journal is not balanced: debit % credit %', d, c; END IF;
 RAISE NOTICE 'ok   journal balances: % lines, debit = credit = %', n, d;
END $$;
SELECT t.cnt($$SELECT 1 FROM public.accounting_journal WHERE source='payment' AND account='Mobile money' AND debit_pesewas=10000$$,1,'online payment appears as a mobile-money debit');
SELECT t.act('00000000-0000-0000-0000-0000000000a3');
SELECT t.cnt('SELECT 1 FROM public.accounting_journal',0,'teacher cannot read the journal');
SELECT t.act('00000000-0000-0000-0000-0000000000b1');
SELECT t.cnt('SELECT 1 FROM public.accounting_journal',0,'other school cannot read this journal');
SELECT t.root();
ROLLBACK;
