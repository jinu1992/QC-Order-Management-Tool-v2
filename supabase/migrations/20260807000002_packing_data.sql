-- packing_data: replaces the Master_Packing_Data sheet tab. That sheet had dynamic,
-- upload-driven columns (box IDs, per-box item breakdowns) with no fixed schema --
-- getPackingData() in the old GAS backend just read whatever headers existed and
-- returned them as generic objects. Modeled here as one row per (reference_code, box)
-- with the variable per-box data kept as jsonb rather than forcing a rigid column set
-- that would need another migration every time a new packing-list format shows up.

create table packing_data (
  id uuid primary key default gen_random_uuid(),
  reference_code text not null,
  box_id text,
  data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index idx_packing_data_reference_code on packing_data (reference_code);

alter table packing_data enable row level security;
create policy deny_all_packing_data on packing_data for all using (false) with check (false);
