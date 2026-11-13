begin;

-- Existing RPCs use an explicit role allowlist. Make that decision fail closed
-- for authenticated identities whose active profile lookup returns NULL.
do $$
declare
  rpc record;
  definition text;
  hardened text;
begin
  if to_regprocedure('public.upsert_qb_product_cost_rule(uuid,uuid,text,numeric,uuid,boolean,integer)') is null
    or to_regprocedure('public.admin_update_qb_internal_order_after_preparation(uuid,timestamptz,date,text,text,jsonb,text)') is null then
    raise exception 'QB_RPC_ROLE_HARDENING_PREDECESSOR_MISSING';
  end if;
  for rpc in
    select oid
    from pg_proc
    where pronamespace = 'public'::regnamespace and prokind = 'f' and prosecdef
      and prosrc ~* '(v_role|public\.current_user_role\(\))\s+not\s+in\s*\('
  loop
    definition := pg_get_functiondef(rpc.oid);
    hardened := regexp_replace(definition,
      '(\m(?:v_role|public\.current_user_role\(\)))\s+not\s+in\s*(\([^()]+\))',
      'not coalesce(\1 in \2, false)', 'gi');
    if hardened is not distinct from definition then
      raise exception 'QB_RPC_ROLE_HARDENING_UNEXPECTED_DEFINITION %', rpc.oid::regprocedure;
    end if;
    execute hardened;
  end loop;
end $$;

commit;
