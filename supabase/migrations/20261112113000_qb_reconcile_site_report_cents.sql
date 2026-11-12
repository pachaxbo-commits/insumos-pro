begin;

create or replace function public.get_qb_site_sales_report(p_start date, p_end date)
returns table (location_id uuid, site text, receipt_count bigint, sales numeric)
language plpgsql stable security definer set search_path = pg_catalog
as $$
declare
  actor_role text := public.current_user_role();
  is_admin boolean := coalesce(actor_role in ('admin', 'administrador'), false);
begin
  if auth.uid() is null or not (is_admin or coalesce(actor_role = 'supervisor', false)) then
    raise exception 'QB_SITE_REPORT_FORBIDDEN' using errcode = '42501';
  end if;
  if p_start is null or p_end is null or p_end < p_start or p_end - p_start > 365 then
    raise exception 'QB_SITE_REPORT_INVALID_PERIOD' using errcode = '22023';
  end if;

  return query
  with sites as (
    select l.id, l.label
    from public.qb_customer_locations l
    where is_admin or exists (
      select 1 from private.qb_supervisor_report_locations a
      where a.supervisor_id = auth.uid() and a.location_id = l.id
    )
  ), issued as (
    select r.id, r.customer_account_id, r.total_amount
    from public.qb_receipts r
    where r.status = 'emitido'
      and r.issued_at >= (p_start::timestamp at time zone 'America/La_Paz')
      and r.issued_at < ((p_end + 1)::timestamp at time zone 'America/La_Paz')
  ), lines as (
    select r.id receipt_id, l.id line_id, l.line_total, l.sale_total_precise, loc.id site_id
    from issued r
    join public.qb_receipt_lines l on l.receipt_id = r.id
    left join public.qb_receipt_orders ro on ro.id = l.receipt_order_id
      and ro.receipt_id = r.id and ro.order_id = l.order_id
      and ro.customer_account_id = r.customer_account_id and ro.inclusion_status = 'emitido'
    left join public.qb_orders o on o.id = ro.order_id
      and o.customer_account_id = r.customer_account_id
    left join public.qb_customer_locations loc on loc.id = o.customer_location_id
      and loc.customer_account_id = o.customer_account_id
  ), reconciled as (
    select r.id, r.total_amount, sum(l.line_total)=r.total_amount as rounded_lines_match
    from issued r
    join lines l on l.receipt_id = r.id
    group by r.id, r.total_amount
    having count(*)=count(l.line_total) and (
      sum(l.line_total)=r.total_amount
      or (count(*)=count(l.sale_total_precise) and min(l.sale_total_precise)>=0
        and round(sum(l.sale_total_precise),2)=r.total_amount)
    )
  ), cents as (
    select l.receipt_id,l.site_id,l.line_total,r.rounded_lines_match,
      floor(l.sale_total_precise*100) as whole_cents,
      r.total_amount*100 - sum(floor(l.sale_total_precise*100)) over (partition by l.receipt_id) as remaining,
      row_number() over (partition by l.receipt_id order by
        l.sale_total_precise*100-floor(l.sale_total_precise*100) desc,l.line_id) as priority
    from lines l join reconciled r on r.id=l.receipt_id
  ), amounts as (
    -- Assign residual cents to the largest fractional parts, breaking ties by line ID.
    select c.receipt_id,c.site_id,case when c.rounded_lines_match then c.line_total
      else (c.whole_cents + case when c.priority<=c.remaining then 1 else 0 end)/100 end as amount
    from cents c
    union all
    -- Keep an unreconciled receipt whole. Its difference cannot be assigned to a site.
    select r.id, null::uuid, r.total_amount
    from issued r where not exists (select 1 from reconciled c where c.id = r.id)
  )
  select s.id, coalesce(nullif(s.label, ''), 'Sede sin nombre'),
    count(distinct a.receipt_id), coalesce(sum(a.amount), 0)
  from sites s left join amounts a on a.site_id = s.id
  group by s.id, s.label
  union all
  select null::uuid, 'Sin atribución', count(distinct a.receipt_id), sum(a.amount)
  from amounts a where is_admin and a.site_id is null
  having count(*) > 0;
end;
$$;

revoke all on function public.get_qb_site_sales_report(date, date) from public, anon;
grant execute on function public.get_qb_site_sales_report(date, date) to authenticated;

commit;

