-- Row-Level Security: deny-by-default on every table.
--
-- Authorization for this app is centralized in the Express backend (Role x ViewType
-- permission matrix), not in Postgres RLS -- the browser never talks to Supabase
-- directly, only the Express server does, using the service_role key (which bypasses
-- RLS entirely). These policies are cheap defense-in-depth: if the anon/authenticated
-- key were ever accidentally exposed to the frontend, or a future client (e.g. a mobile
-- app) queries Supabase directly, no rows are readable/writable until a real policy is
-- added for that use case.

do $$
declare
  t text;
begin
  foreach t in array array[
    'users', 'channel_configs', 'inventory', 'customers', 'store_poc_mappings',
    'po_repository', 'purchase_orders', 'po_items', 'ee_orders', 'shipments',
    'invoices', 'appointments', 'fba_shipments', 'quotations', 'quotation_items',
    'upload_logs', 'activity_logs', 'system_config'
  ]
  loop
    execute format('alter table %I enable row level security;', t);
    execute format(
      'create policy deny_all_%1$s on %1$s for all using (false) with check (false);',
      t
    );
  end loop;
end;
$$;
