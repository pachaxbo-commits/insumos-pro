-- FIFO controls warehouse lot consumption only. Receipt line costs come from
-- confirmed warehouse purchase references (or an explicit manual override).
-- Historical FIFO ledger rows remain untouched.

drop trigger if exists qb_snapshot_fifo_cost_on_new_receipt_line
  on public.qb_receipt_lines;

comment on function public.snapshot_fifo_cost_for_new_receipt_line() is
  'Deprecated: FIFO is inventory-only. Receipt costs use confirmed purchase references or explicit manual values.';
