-- Retire the old multi-call QA reset RPCs. The reviewed prepublication archive
-- procedure is now the only supported operational cleanup path.
begin;

revoke all on function public.execute_qb_test_data_reset(uuid, text, text)
  from public, anon, authenticated, service_role;
revoke all on function public.reset_qb_stock_test_data(uuid, text)
  from public, anon, authenticated, service_role;

comment on function public.execute_qb_test_data_reset(uuid, text, text) is
  'Retired legacy reset. Execution is revoked; use the separately reviewed prepublication archive procedure.';
comment on function public.reset_qb_stock_test_data(uuid, text) is
  'Retired legacy reset. Execution is revoked; use the separately reviewed prepublication archive procedure.';

commit;
