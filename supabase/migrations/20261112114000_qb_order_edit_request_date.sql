begin;

do $$
declare
  definition text := pg_get_functiondef('public.admin_update_qb_internal_order_after_preparation(uuid,timestamptz,date,text,text,jsonb,text)'::regprocedure);
  original text := 'if v_saved.actor_id <> v_user_id or v_saved.request_payload <> v_request then';
begin
  if position('''operational_date'',p_operational_date' in definition)>0 then return; end if;
  if position(original in definition)=0 or position('''expected_updated_at'',p_expected_updated_at,' in definition)=0 then
    raise exception 'QB_ORDER_EDIT_IDENTITY_PREDECESSOR_UNEXPECTED';
  end if;
  definition := replace(definition,'''expected_updated_at'',p_expected_updated_at,',
    '''expected_updated_at'',p_expected_updated_at,''operational_date'',p_operational_date,');
  definition := replace(definition,original,$guard$if v_saved.actor_id <> v_user_id or (
    v_saved.request_payload is distinct from v_request
    and not (
      not (v_saved.request_payload ? 'operational_date')
      and v_saved.request_payload = v_request - 'operational_date'
      and exists (select 1 from public.qb_orders o
        where o.id=p_order_id and o.operational_date=p_operational_date)
    )
  ) then$guard$);
  execute definition;
end $$;

commit;
