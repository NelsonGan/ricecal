-- Migration unit 1: schema_changes
-- Transaction mode: transactional
-- Boundary reason: default

CREATE TABLE public.packet_panels (
  food_log_id uuid                     NOT NULL,
  barcode     text                     NOT NULL,
  kcal        integer                  NOT NULL,
  carbs_g     numeric(6,1)             NOT NULL,
  protein_g   numeric(6,1)             NOT NULL,
  fat_g       numeric(6,1)             NOT NULL,
  serving_g   numeric(7,1),
  created_at  timestamp with time zone DEFAULT now() NOT NULL
);

ALTER TABLE public.packet_panels
  ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.packet_panels
  ADD CONSTRAINT packet_panels_barcode_check CHECK (barcode ~ '^[0-9]{14}$'::text);

ALTER TABLE public.packet_panels
  ADD CONSTRAINT packet_panels_carbs_g_check CHECK (carbs_g >= 0::numeric);

ALTER TABLE public.packet_panels
  ADD CONSTRAINT packet_panels_fat_g_check CHECK (fat_g >= 0::numeric);

ALTER TABLE public.packet_panels
  ADD CONSTRAINT packet_panels_food_log_id_fkey FOREIGN KEY (food_log_id) REFERENCES public.food_logs(id) ON DELETE CASCADE;

ALTER TABLE public.packet_panels
  ADD CONSTRAINT packet_panels_kcal_check CHECK (kcal > 0 AND kcal <= 2000);

ALTER TABLE public.packet_panels
  ADD CONSTRAINT packet_panels_pkey PRIMARY KEY (food_log_id);

ALTER TABLE public.packet_panels
  ADD CONSTRAINT packet_panels_protein_g_check CHECK (protein_g >= 0::numeric);

ALTER TABLE public.packet_panels
  ADD CONSTRAINT packet_panels_serving_g_check CHECK (serving_g > 0::numeric);

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE ON public.packet_panels TO service_role;
-- Not emitted by `db diff`, which misses grant deltas (README, Traps). The new
-- table inherits Supabase's default client grants, and `packet_panels` is
-- service-only, as `schemas/32_food_scans.sql` declares.
REVOKE ALL ON public.packet_panels FROM anon;

REVOKE ALL ON public.packet_panels FROM authenticated;
