-- CODE 021: Controlled academic year and term activation.
BEGIN;
-- Prevent direct changes to statuses; only controlled RPCs may activate.
REVOKE UPDATE (status) ON public.academic_years FROM authenticated;
REVOKE UPDATE (status) ON public.terms FROM authenticated;
CREATE UNIQUE INDEX IF NOT EXISTS terms_one_active_per_school
  ON public.terms (school_id) WHERE status = 'active';

CREATE OR REPLACE FUNCTION public.activate_academic_year(p_school_id uuid, p_year_id uuid)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_year public.academic_years%ROWTYPE;
BEGIN
  IF auth.uid() IS NULL OR NOT private.has_school_permission(p_school_id, 'academics.manage') THEN
    RAISE EXCEPTION 'Not authorized to activate academic years' USING ERRCODE = '42501';
  END IF;
  -- Lock the school row so concurrent activations serialize.
  PERFORM 1 FROM public.schools
   WHERE id = p_school_id AND status = 'active' FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'School unavailable' USING ERRCODE = '42501'; END IF;
  SELECT * INTO v_year FROM public.academic_years
   WHERE school_id=p_school_id AND id=p_year_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Academic year not found' USING ERRCODE = 'P0002'; END IF;
  IF v_year.status = 'completed' THEN
    RAISE EXCEPTION 'Completed academic years cannot be reactivated' USING ERRCODE = '23514';
  END IF;
  UPDATE public.terms SET status='completed'
   WHERE school_id=p_school_id AND status='active';
  UPDATE public.academic_years SET status='completed'
   WHERE school_id=p_school_id AND status='active' AND id<>p_year_id;
  UPDATE public.academic_years SET status='active'
   WHERE id=p_year_id AND school_id=p_school_id;
  RETURN p_year_id;
END; $$;

CREATE OR REPLACE FUNCTION public.activate_academic_term(p_school_id uuid, p_term_id uuid)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_term public.terms%ROWTYPE;
BEGIN
  IF auth.uid() IS NULL OR NOT private.has_school_permission(p_school_id, 'academics.manage') THEN
    RAISE EXCEPTION 'Not authorized to activate terms' USING ERRCODE = '42501';
  END IF;
  PERFORM 1 FROM public.schools
   WHERE id=p_school_id AND status='active' FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'School unavailable' USING ERRCODE = '42501'; END IF;
  SELECT * INTO v_term FROM public.terms
   WHERE school_id=p_school_id AND id=p_term_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Term not found' USING ERRCODE = 'P0002'; END IF;
  IF v_term.status='completed' THEN
    RAISE EXCEPTION 'Completed terms cannot be reactivated' USING ERRCODE = '23514';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.academic_years
     WHERE id=v_term.academic_year_id AND school_id=p_school_id AND status='active'
  ) THEN
    RAISE EXCEPTION 'Activate the parent academic year first' USING ERRCODE = '23514';
  END IF;
  UPDATE public.terms SET status='completed'
    WHERE school_id=p_school_id AND status='active' AND id<>p_term_id;
  UPDATE public.terms SET status='active'
    WHERE school_id=p_school_id AND id=p_term_id;
  RETURN p_term_id;
END; $$;

REVOKE ALL ON FUNCTION public.activate_academic_year(uuid,uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.activate_academic_term(uuid,uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.activate_academic_year(uuid,uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.activate_academic_term(uuid,uuid) TO authenticated;
COMMIT;
