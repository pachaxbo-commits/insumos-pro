begin;

create or replace function private.qb_can_read_supervisor_receipt(p_receipt_id uuid)
returns boolean
language sql stable security definer set search_path = pg_catalog
as $$
  select coalesce(public.current_user_role() in ('admin', 'administrador'), false)
    or (coalesce(public.current_user_role() = 'supervisor', false)
      and exists (select 1 from public.qb_receipts r where r.id=p_receipt_id and r.status='emitido')
      and exists (select 1 from public.qb_receipt_orders ro where ro.receipt_id=p_receipt_id)
      and not exists (
        select 1 from public.qb_receipt_orders ro
        where ro.receipt_id=p_receipt_id and not exists (
          select 1 from public.qb_orders o
          join public.qb_receipts r on r.id=ro.receipt_id and r.customer_account_id=o.customer_account_id
          join public.qb_customer_locations loc on loc.id=o.customer_location_id and loc.customer_account_id=o.customer_account_id
          join private.qb_supervisor_report_locations a on a.location_id=loc.id and a.supervisor_id=auth.uid()
          where o.id=ro.order_id and ro.customer_account_id=r.customer_account_id and ro.inclusion_status='emitido'
        )
      )
      and not exists (
        select 1 from public.qb_receipt_lines l where l.receipt_id=p_receipt_id
        and not exists (
          select 1 from public.qb_receipt_orders ro
          where ro.id=l.receipt_order_id and ro.receipt_id=l.receipt_id and ro.order_id=l.order_id
        )
      ));
$$;
revoke all on function private.qb_can_read_supervisor_receipt(uuid) from public, anon, authenticated;
-- A public view evaluates function EXECUTE as its caller. The function only
-- returns a boolean for that caller, and the private schema is not exposed.
grant execute on function private.qb_can_read_supervisor_receipt(uuid) to authenticated;

drop view if exists public.qb_supervisor_receipt_events, public.qb_supervisor_receipt_orders,
  public.qb_supervisor_receipt_lines, public.qb_supervisor_receipts;

create view public.qb_supervisor_receipts with (security_barrier=true) as
select r.id,r.receipt_number,r.status,r.pricing_mode,r.customer_account_id,
  coalesce(nullif(trim(c.full_name),''),'Cliente') customer_name,
  c.email customer_email,c.phone customer_phone,r.period_start,r.period_end,r.total_amount,
  r.visible_note,r.issued_at,r.receipt_sent_at,r.receipt_sent_by,r.payment_status,
  r.paid_at,r.paid_by,r.voided_at,r.void_reason,r.created_at
from public.qb_receipts r join public.customer_accounts c on c.id=r.customer_account_id
where private.qb_can_read_supervisor_receipt(r.id);

create view public.qb_supervisor_receipt_lines with (security_barrier=true) as
select l.id,l.receipt_id,l.order_id,o.public_reference order_reference,l.product_id,
  l.product_name_snapshot,l.product_code_snapshot,l.category_name_snapshot,
  l.delivered_base_quantity,l.base_unit_symbol,l.visible_unit_label,l.order_input_mode,
  l.requested_amount_bs,l.currency_snapshot,price_unit.symbol pricing_unit_symbol,
  l.estimated_base_quantity,l.fixed_line_amount,l.final_unit_price,l.line_total,l.created_at,
  l.actual_weight_value,l.actual_weight_kg,weight_unit.symbol actual_weight_unit_symbol,
  l.commercial_quantity_snapshot,l.commercial_unit_label_snapshot
from public.qb_receipt_lines l join public.qb_orders o on o.id=l.order_id
left join public.qb_units price_unit on price_unit.id=l.pricing_unit_id
left join public.qb_units weight_unit on weight_unit.id=l.actual_weight_unit_id
where private.qb_can_read_supervisor_receipt(l.receipt_id);

create view public.qb_supervisor_receipt_orders with (security_barrier=true) as
select ro.id,ro.receipt_id,ro.order_id,ro.inclusion_status,o.public_reference order_reference
from public.qb_receipt_orders ro join public.qb_orders o on o.id=ro.order_id
where private.qb_can_read_supervisor_receipt(ro.receipt_id);

create view public.qb_supervisor_receipt_events with (security_barrier=true) as
select e.id,e.receipt_id,e.event_type,e.created_at from public.qb_receipt_events e
where private.qb_can_read_supervisor_receipt(e.receipt_id);

revoke all on public.qb_supervisor_receipts, public.qb_supervisor_receipt_lines,
  public.qb_supervisor_receipt_orders, public.qb_supervisor_receipt_events from public, anon, authenticated;
grant select on public.qb_supervisor_receipts, public.qb_supervisor_receipt_lines,
  public.qb_supervisor_receipt_orders, public.qb_supervisor_receipt_events to authenticated;

-- Receipt mutations remain administrator-only until site-scoped writes are approved.
do $$
declare
  signature text;
  definition text;
  guarded text;
begin
  foreach signature in array array[
    'create_qb_receipt_draft(uuid,uuid[])','create_qb_receipt_line_draft(uuid,uuid[])',
    'emit_qb_receipt(uuid)','void_qb_receipt(uuid,text)',
    'set_qb_receipt_manual_tracking(uuid,boolean,text)','set_qb_receipt_line_pricing(uuid,jsonb)',
    'set_qb_receipt_purchase_costs(uuid,jsonb)','recalculate_qb_receipt_totals_legacy(uuid)',
    'update_qb_receipt_draft(uuid,numeric,numeric,numeric,numeric,text,text,jsonb)',
    'update_qb_receipt_draft_legacy(uuid,numeric,numeric,numeric,numeric,text,text,jsonb)'
  ] loop
    definition := pg_get_functiondef(('public.'||signature)::regprocedure);
    if position('QB_RECEIPT_ADMIN_WRITE_REQUIRED' in definition) > 0 then continue; end if;
    guarded := regexp_replace(definition, '(^|\n)begin[ \t]*(\r?\n)',
      E'\\1begin\\2  if not coalesce(public.current_user_role() in (''admin'',''administrador''),false) then\n    raise exception ''QB_RECEIPT_ADMIN_WRITE_REQUIRED'' using errcode = ''42501'';\n  end if;\n', 'i');
    if guarded=definition then raise exception 'QB_RECEIPT_WRITER_UNEXPECTED %',signature; end if;
    execute guarded;
  end loop;
end $$;

revoke execute on function public.set_qb_receipt_supervisor_line_costs(uuid,jsonb),
  public.update_qb_receipt_draft_supervisor(uuid,text,jsonb) from public, anon, authenticated;

commit;
