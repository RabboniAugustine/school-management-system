-- CODE 039: Transport (routes, vehicles, student assignments) and hostel (rooms, bed allocations).
BEGIN;
CREATE TABLE public.transport_routes (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 school_id uuid NOT NULL REFERENCES public.schools(id) ON DELETE RESTRICT,
 name text NOT NULL CHECK(char_length(btrim(name)) BETWEEN 2 AND 120),
 description text CHECK(description IS NULL OR char_length(description)<=300),
 fee_pesewas bigint NOT NULL DEFAULT 0 CHECK(fee_pesewas >= 0),
 is_active boolean NOT NULL DEFAULT true,
 created_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(school_id,id), UNIQUE(school_id,name)
);
CREATE TABLE public.transport_vehicles (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 school_id uuid NOT NULL REFERENCES public.schools(id) ON DELETE RESTRICT,
 route_id uuid,
 plate_number text NOT NULL CHECK(char_length(btrim(plate_number)) BETWEEN 3 AND 20),
 capacity integer NOT NULL CHECK(capacity BETWEEN 1 AND 200),
 driver_name text CHECK(driver_name IS NULL OR char_length(btrim(driver_name)) BETWEEN 2 AND 120),
 driver_phone text CHECK(driver_phone IS NULL OR char_length(btrim(driver_phone)) BETWEEN 7 AND 25),
 is_active boolean NOT NULL DEFAULT true,
 created_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(school_id,plate_number),
 FOREIGN KEY(school_id,route_id) REFERENCES public.transport_routes(school_id,id) ON DELETE RESTRICT
);
CREATE INDEX transport_vehicles_route_idx ON public.transport_vehicles(school_id,route_id);
CREATE TABLE public.student_transport (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 school_id uuid NOT NULL REFERENCES public.schools(id) ON DELETE RESTRICT,
 student_id uuid NOT NULL,
 route_id uuid NOT NULL,
 academic_year_id uuid NOT NULL,
 pickup_point text CHECK(pickup_point IS NULL OR char_length(btrim(pickup_point)) BETWEEN 2 AND 160),
 status text NOT NULL DEFAULT 'active' CHECK(status IN ('active','ended')),
 created_at timestamptz NOT NULL DEFAULT now(),
 FOREIGN KEY(school_id,student_id) REFERENCES public.students(school_id,id) ON DELETE RESTRICT,
 FOREIGN KEY(school_id,route_id) REFERENCES public.transport_routes(school_id,id) ON DELETE RESTRICT,
 FOREIGN KEY(school_id,academic_year_id) REFERENCES public.academic_years(school_id,id) ON DELETE RESTRICT
);
CREATE UNIQUE INDEX student_transport_one_active ON public.student_transport(school_id,student_id,academic_year_id) WHERE status='active';
CREATE INDEX student_transport_route_idx ON public.student_transport(school_id,route_id) WHERE status='active';

-- A route with vehicles cannot carry more students than its active vehicles seat.
CREATE OR REPLACE FUNCTION private.validate_student_transport()
RETURNS trigger LANGUAGE plpgsql SET search_path = '' AS $$
DECLARE v_cap integer; v_used integer; v_active boolean;
BEGIN
 IF NEW.status <> 'active' THEN RETURN NEW; END IF;
 SELECT is_active INTO v_active FROM public.transport_routes WHERE id=NEW.route_id AND school_id=NEW.school_id FOR UPDATE;
 IF NOT v_active THEN RAISE EXCEPTION 'Route is not active' USING ERRCODE='23514'; END IF;
 SELECT COALESCE(SUM(capacity),0) INTO v_cap FROM public.transport_vehicles WHERE route_id=NEW.route_id AND school_id=NEW.school_id AND is_active;
 IF v_cap > 0 THEN
  SELECT COUNT(*) INTO v_used FROM public.student_transport WHERE route_id=NEW.route_id AND school_id=NEW.school_id AND status='active' AND id IS DISTINCT FROM NEW.id;
  IF v_used >= v_cap THEN RAISE EXCEPTION 'Route is full (% seats)', v_cap USING ERRCODE='23514'; END IF;
 END IF;
 RETURN NEW;
END; $$;
CREATE TRIGGER student_transport_validate BEFORE INSERT OR UPDATE OF status,route_id ON public.student_transport FOR EACH ROW EXECUTE FUNCTION private.validate_student_transport();

CREATE TABLE public.hostels (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 school_id uuid NOT NULL REFERENCES public.schools(id) ON DELETE RESTRICT,
 name text NOT NULL CHECK(char_length(btrim(name)) BETWEEN 2 AND 120),
 gender text NOT NULL DEFAULT 'mixed' CHECK(gender IN ('male','female','mixed')),
 is_active boolean NOT NULL DEFAULT true,
 created_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(school_id,id), UNIQUE(school_id,name)
);
CREATE TABLE public.hostel_rooms (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 school_id uuid NOT NULL REFERENCES public.schools(id) ON DELETE RESTRICT,
 hostel_id uuid NOT NULL,
 room_number text NOT NULL CHECK(char_length(btrim(room_number)) BETWEEN 1 AND 20),
 capacity integer NOT NULL CHECK(capacity BETWEEN 1 AND 40),
 created_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(school_id,id), UNIQUE(school_id,hostel_id,room_number),
 FOREIGN KEY(school_id,hostel_id) REFERENCES public.hostels(school_id,id) ON DELETE RESTRICT
);
CREATE TABLE public.hostel_allocations (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 school_id uuid NOT NULL REFERENCES public.schools(id) ON DELETE RESTRICT,
 room_id uuid NOT NULL,
 student_id uuid NOT NULL,
 academic_year_id uuid NOT NULL,
 status text NOT NULL DEFAULT 'active' CHECK(status IN ('active','ended')),
 allocated_on date NOT NULL DEFAULT CURRENT_DATE,
 ended_on date,
 created_at timestamptz NOT NULL DEFAULT now(),
 CHECK(ended_on IS NULL OR ended_on >= allocated_on),
 FOREIGN KEY(school_id,room_id) REFERENCES public.hostel_rooms(school_id,id) ON DELETE RESTRICT,
 FOREIGN KEY(school_id,student_id) REFERENCES public.students(school_id,id) ON DELETE RESTRICT,
 FOREIGN KEY(school_id,academic_year_id) REFERENCES public.academic_years(school_id,id) ON DELETE RESTRICT
);
CREATE UNIQUE INDEX hostel_one_bed_per_student ON public.hostel_allocations(school_id,student_id,academic_year_id) WHERE status='active';
CREATE INDEX hostel_allocations_room_idx ON public.hostel_allocations(school_id,room_id) WHERE status='active';

CREATE OR REPLACE FUNCTION private.validate_hostel_allocation()
RETURNS trigger LANGUAGE plpgsql SET search_path = '' AS $$
DECLARE v_cap integer; v_used integer; v_hostel_gender text; v_hostel_active boolean; v_student_gender text;
BEGIN
 IF NEW.status <> 'active' THEN RETURN NEW; END IF;
 SELECT r.capacity,h.gender,h.is_active INTO v_cap,v_hostel_gender,v_hostel_active
  FROM public.hostel_rooms r JOIN public.hostels h ON h.id=r.hostel_id AND h.school_id=r.school_id
  WHERE r.id=NEW.room_id AND r.school_id=NEW.school_id FOR UPDATE OF r;
 IF NOT v_hostel_active THEN RAISE EXCEPTION 'Hostel is not active' USING ERRCODE='23514'; END IF;
 SELECT COUNT(*) INTO v_used FROM public.hostel_allocations WHERE room_id=NEW.room_id AND school_id=NEW.school_id AND status='active' AND id IS DISTINCT FROM NEW.id;
 IF v_used >= v_cap THEN RAISE EXCEPTION 'Room is full (% beds)', v_cap USING ERRCODE='23514'; END IF;
 SELECT gender INTO v_student_gender FROM public.students WHERE id=NEW.student_id AND school_id=NEW.school_id;
 IF v_hostel_gender <> 'mixed' AND v_student_gender IN ('male','female') AND v_student_gender <> v_hostel_gender THEN
  RAISE EXCEPTION 'This is a % hostel', v_hostel_gender USING ERRCODE='23514';
 END IF;
 RETURN NEW;
END; $$;
CREATE TRIGGER hostel_allocation_validate BEFORE INSERT OR UPDATE OF status,room_id ON public.hostel_allocations FOR EACH ROW EXECUTE FUNCTION private.validate_hostel_allocation();

INSERT INTO public.permissions(code,name,description) VALUES
 ('transport.read','View transport','View routes, vehicles and student transport'),
 ('transport.manage','Manage transport','Maintain routes and vehicles and assign students'),
 ('hostel.read','View hostels','View hostels, rooms and allocations'),
 ('hostel.manage','Manage hostels','Maintain hostels and rooms and allocate beds')
ON CONFLICT(code) DO NOTHING;
INSERT INTO public.role_permissions(role_id,permission_id)
SELECT r.id,p.id FROM (VALUES
 ('proprietor','transport.read'),('proprietor','transport.manage'),('proprietor','hostel.read'),('proprietor','hostel.manage'),
 ('school_admin','transport.read'),('school_admin','transport.manage'),('school_admin','hostel.read'),('school_admin','hostel.manage'),
 ('head_teacher','transport.read'),('head_teacher','hostel.read'),('bursar','transport.read')
) v(role_code,permission_code)
JOIN public.roles r ON r.code=v.role_code JOIN public.permissions p ON p.code=v.permission_code
ON CONFLICT(role_id,permission_id) DO NOTHING;

ALTER TABLE public.transport_routes ENABLE ROW LEVEL SECURITY; ALTER TABLE public.transport_vehicles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.student_transport ENABLE ROW LEVEL SECURITY; ALTER TABLE public.hostels ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.hostel_rooms ENABLE ROW LEVEL SECURITY; ALTER TABLE public.hostel_allocations ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.transport_routes,public.transport_vehicles,public.student_transport,public.hostels,public.hostel_rooms,public.hostel_allocations FROM PUBLIC,anon,authenticated;
GRANT SELECT ON public.transport_routes,public.transport_vehicles,public.student_transport,public.hostels,public.hostel_rooms,public.hostel_allocations TO authenticated;
GRANT INSERT(school_id,name,description,fee_pesewas) ON public.transport_routes TO authenticated;
GRANT UPDATE(name,description,fee_pesewas,is_active) ON public.transport_routes TO authenticated;
GRANT INSERT(school_id,route_id,plate_number,capacity,driver_name,driver_phone) ON public.transport_vehicles TO authenticated;
GRANT UPDATE(route_id,capacity,driver_name,driver_phone,is_active) ON public.transport_vehicles TO authenticated;
GRANT INSERT(school_id,student_id,route_id,academic_year_id,pickup_point) ON public.student_transport TO authenticated;
GRANT UPDATE(route_id,pickup_point,status) ON public.student_transport TO authenticated;
GRANT INSERT(school_id,name,gender) ON public.hostels TO authenticated;
GRANT UPDATE(name,gender,is_active) ON public.hostels TO authenticated;
GRANT INSERT(school_id,hostel_id,room_number,capacity) ON public.hostel_rooms TO authenticated;
GRANT UPDATE(capacity) ON public.hostel_rooms TO authenticated;
GRANT INSERT(school_id,room_id,student_id,academic_year_id,allocated_on) ON public.hostel_allocations TO authenticated;
GRANT UPDATE(room_id,status,ended_on) ON public.hostel_allocations TO authenticated;

DO $$ DECLARE t text; BEGIN
 FOREACH t IN ARRAY ARRAY['transport_routes','transport_vehicles','student_transport'] LOOP
  EXECUTE format('CREATE POLICY %I ON public.%I FOR SELECT TO authenticated USING(private.has_school_permission(school_id,%L))', t||'_select', t, 'transport.read');
  EXECUTE format('CREATE POLICY %I ON public.%I FOR INSERT TO authenticated WITH CHECK(private.has_school_permission(school_id,%L))', t||'_insert', t, 'transport.manage');
  EXECUTE format('CREATE POLICY %I ON public.%I FOR UPDATE TO authenticated USING(private.has_school_permission(school_id,%L)) WITH CHECK(private.has_school_permission(school_id,%L))', t||'_update', t, 'transport.manage', 'transport.manage');
 END LOOP;
 FOREACH t IN ARRAY ARRAY['hostels','hostel_rooms','hostel_allocations'] LOOP
  EXECUTE format('CREATE POLICY %I ON public.%I FOR SELECT TO authenticated USING(private.has_school_permission(school_id,%L))', t||'_select', t, 'hostel.read');
  EXECUTE format('CREATE POLICY %I ON public.%I FOR INSERT TO authenticated WITH CHECK(private.has_school_permission(school_id,%L))', t||'_insert', t, 'hostel.manage');
  EXECUTE format('CREATE POLICY %I ON public.%I FOR UPDATE TO authenticated USING(private.has_school_permission(school_id,%L)) WITH CHECK(private.has_school_permission(school_id,%L))', t||'_update', t, 'hostel.manage', 'hostel.manage');
 END LOOP;
END $$;
COMMIT;
