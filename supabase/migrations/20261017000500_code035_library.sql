-- CODE 035: Library catalogue and loans (students or staff), with copy availability and fines.
BEGIN;
CREATE TABLE public.library_books (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 school_id uuid NOT NULL REFERENCES public.schools(id) ON DELETE RESTRICT,
 isbn text CHECK(isbn IS NULL OR char_length(btrim(isbn)) BETWEEN 5 AND 20),
 title text NOT NULL CHECK(char_length(btrim(title)) BETWEEN 1 AND 200),
 author text CHECK(author IS NULL OR char_length(btrim(author)) BETWEEN 1 AND 160),
 category text CHECK(category IS NULL OR char_length(btrim(category)) BETWEEN 1 AND 80),
 copies_total integer NOT NULL DEFAULT 1 CHECK(copies_total BETWEEN 1 AND 1000),
 is_active boolean NOT NULL DEFAULT true,
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(school_id,id)
);
CREATE UNIQUE INDEX library_books_isbn_uidx ON public.library_books(school_id,isbn) WHERE isbn IS NOT NULL;
CREATE INDEX library_books_title_idx ON public.library_books(school_id,lower(title));
CREATE TRIGGER library_books_updated BEFORE UPDATE ON public.library_books FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE public.library_loans (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 school_id uuid NOT NULL REFERENCES public.schools(id) ON DELETE RESTRICT,
 book_id uuid NOT NULL,
 student_id uuid,
 staff_id uuid,
 loaned_on date NOT NULL DEFAULT CURRENT_DATE,
 due_on date NOT NULL,
 returned_on date,
 fine_pesewas bigint NOT NULL DEFAULT 0 CHECK(fine_pesewas >= 0),
 created_by uuid DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE SET NULL,
 created_at timestamptz NOT NULL DEFAULT now(),
 CHECK((student_id IS NOT NULL)::int + (staff_id IS NOT NULL)::int = 1),
 CHECK(due_on >= loaned_on),
 FOREIGN KEY(school_id,book_id) REFERENCES public.library_books(school_id,id) ON DELETE RESTRICT,
 FOREIGN KEY(school_id,student_id) REFERENCES public.students(school_id,id) ON DELETE RESTRICT,
 FOREIGN KEY(school_id,staff_id) REFERENCES public.staff_members(school_id,id) ON DELETE RESTRICT
);
CREATE INDEX library_loans_open_idx ON public.library_loans(school_id,book_id) WHERE returned_on IS NULL;
CREATE INDEX library_loans_student_idx ON public.library_loans(school_id,student_id);

-- Lend only while a copy is free; lock the book row so two librarians cannot lend the last copy together.
CREATE OR REPLACE FUNCTION private.validate_loan()
RETURNS trigger LANGUAGE plpgsql SET search_path = '' AS $$
DECLARE v_total integer; v_out integer; v_active boolean;
BEGIN
 SELECT copies_total,is_active INTO v_total,v_active FROM public.library_books WHERE id=NEW.book_id AND school_id=NEW.school_id FOR UPDATE;
 IF NOT v_active THEN RAISE EXCEPTION 'Book is not available for loan' USING ERRCODE='23514'; END IF;
 SELECT COUNT(*) INTO v_out FROM public.library_loans WHERE book_id=NEW.book_id AND school_id=NEW.school_id AND returned_on IS NULL;
 IF v_out >= v_total THEN RAISE EXCEPTION 'No copies available' USING ERRCODE='23514'; END IF;
 RETURN NEW;
END; $$;
CREATE TRIGGER library_loans_validate BEFORE INSERT ON public.library_loans FOR EACH ROW EXECUTE FUNCTION private.validate_loan();

-- Only returned_on/fine may change, and a returned loan stays returned.
CREATE OR REPLACE FUNCTION private.guard_loan_update()
RETURNS trigger LANGUAGE plpgsql SET search_path = '' AS $$
BEGIN
 IF OLD.returned_on IS NOT NULL THEN RAISE EXCEPTION 'Loan already returned' USING ERRCODE='23514'; END IF;
 IF NEW.returned_on IS NOT NULL AND NEW.returned_on < OLD.loaned_on THEN RAISE EXCEPTION 'Return date precedes loan date' USING ERRCODE='23514'; END IF;
 RETURN NEW;
END; $$;
CREATE TRIGGER library_loans_guard BEFORE UPDATE ON public.library_loans FOR EACH ROW EXECUTE FUNCTION private.guard_loan_update();

INSERT INTO public.permissions(code,name,description) VALUES
 ('library.read','View library','View the catalogue and loans'),
 ('library.manage','Manage library','Maintain the catalogue and record loans and returns')
ON CONFLICT(code) DO NOTHING;
INSERT INTO public.role_permissions(role_id,permission_id)
SELECT r.id,p.id FROM (VALUES
 ('proprietor','library.read'),('proprietor','library.manage'),
 ('school_admin','library.read'),('school_admin','library.manage'),
 ('librarian','library.read'),('librarian','library.manage'),
 ('head_teacher','library.read'),('teacher','library.read')
) v(role_code,permission_code)
JOIN public.roles r ON r.code=v.role_code JOIN public.permissions p ON p.code=v.permission_code
ON CONFLICT(role_id,permission_id) DO NOTHING;

ALTER TABLE public.library_books ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.library_loans ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.library_books,public.library_loans FROM PUBLIC,anon,authenticated;
GRANT SELECT ON public.library_books,public.library_loans TO authenticated;
GRANT INSERT(school_id,isbn,title,author,category,copies_total) ON public.library_books TO authenticated;
GRANT UPDATE(title,author,category,copies_total,is_active) ON public.library_books TO authenticated;
GRANT INSERT(school_id,book_id,student_id,staff_id,loaned_on,due_on) ON public.library_loans TO authenticated;
GRANT UPDATE(returned_on,fine_pesewas) ON public.library_loans TO authenticated;
CREATE POLICY books_select ON public.library_books FOR SELECT TO authenticated USING(private.has_school_permission(school_id,'library.read'));
CREATE POLICY books_insert ON public.library_books FOR INSERT TO authenticated WITH CHECK(private.has_school_permission(school_id,'library.manage'));
CREATE POLICY books_update ON public.library_books FOR UPDATE TO authenticated USING(private.has_school_permission(school_id,'library.manage')) WITH CHECK(private.has_school_permission(school_id,'library.manage'));
CREATE POLICY loans_select ON public.library_loans FOR SELECT TO authenticated USING(private.has_school_permission(school_id,'library.read'));
CREATE POLICY loans_insert ON public.library_loans FOR INSERT TO authenticated WITH CHECK(private.has_school_permission(school_id,'library.manage'));
CREATE POLICY loans_update ON public.library_loans FOR UPDATE TO authenticated USING(private.has_school_permission(school_id,'library.manage')) WITH CHECK(private.has_school_permission(school_id,'library.manage'));
COMMIT;
