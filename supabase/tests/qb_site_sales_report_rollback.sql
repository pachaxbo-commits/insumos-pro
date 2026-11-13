\set ON_ERROR_STOP on
begin;

do $$
declare
  admin_id uuid := gen_random_uuid();
  supervisor_id uuid := gen_random_uuid();
  customer_id uuid := gen_random_uuid();
  report_date date := '2080-06-12';
  receipt_amount numeric := 73.25;
  prior_unattributed numeric;
begin
  insert into auth.users(id, email)
  values (admin_id, admin_id || '@example.test'),
    (supervisor_id, supervisor_id || '@example.test'),
    (customer_id, customer_id || '@example.test');
  insert into public.profiles(id, role)
  values (admin_id, 'administrador'), (supervisor_id, 'supervisor');
  insert into public.customer_accounts(id, email, full_name, business_name, responsible_name)
  values (customer_id, customer_id || '@example.test', 'Cliente ficticio', 'Negocio QA', 'Responsable QA');

  perform set_config('request.jwt.claim.sub', admin_id::text, true);
  select coalesce(sum(sales), 0) into prior_unattributed
  from public.get_qb_site_sales_report(report_date, report_date)
  where location_id is null;

  -- A receipt without verifiable lines must remain in the admin's reconciliation.
  insert into public.qb_receipts(
    receipt_number, customer_account_id, status, total_amount, issued_at
  ) values (
    'QA-' || gen_random_uuid(), customer_id, 'emitido', receipt_amount,
    (report_date::timestamp + interval '23 hours') at time zone 'America/La_Paz'
  );
  if not exists (
    select 1 from public.get_qb_site_sales_report(report_date, report_date)
    where location_id is null and sales = prior_unattributed + receipt_amount
  ) then raise exception 'El recibo sin atribución no se concilió en su día boliviano'; end if;

  perform set_config('request.jwt.claim.sub', supervisor_id::text, true);
  if exists (select 1 from public.get_qb_site_sales_report(report_date, report_date)) then
    raise exception 'Un Supervisor sin asignación obtuvo información';
  end if;
  if has_function_privilege('anon', 'public.get_qb_site_sales_report(date,date)', 'EXECUTE')
    or has_table_privilege('authenticated', 'private.qb_supervisor_report_locations', 'SELECT,INSERT,UPDATE,DELETE') then
    raise exception 'Permisos excesivos del reporte de sedes';
  end if;
end $$;

rollback;
