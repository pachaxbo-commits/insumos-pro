begin;

-- Los recibos por cantidad normalmente no necesitan pricing_unit_id. Sin
-- embargo, cuando un producto se cobra por peso real, el trigger
-- align_qb_receipt_weight_pricing_unit guarda aqui la unidad de precio que
-- corresponde al peso confirmado en bodega. Ese snapshot no convierte el
-- pedido en un pedido por Bs y no debe violar el contrato monetario.
alter table public.qb_receipt_lines
  drop constraint if exists qb_receipt_lines_amount_contract_check;

alter table public.qb_receipt_lines
  add constraint qb_receipt_lines_amount_contract_check check (
    (
      order_input_mode = 'quantity'
      and requested_amount_bs is null
      and currency_snapshot is null
      and estimated_base_quantity is null
      and fixed_line_amount is null
    )
    or
    (
      order_input_mode = 'amount_bs'
      and requested_amount_bs is not null
      and requested_amount_bs > 0
      and requested_amount_bs = round(requested_amount_bs, 2)
      and currency_snapshot = 'BOB'
      and pricing_unit_id is not null
      and estimated_base_quantity is not null
      and estimated_base_quantity > 0
      and fixed_line_amount = requested_amount_bs
      and line_total = fixed_line_amount
    )
  );

comment on constraint qb_receipt_lines_amount_contract_check
  on public.qb_receipt_lines is
  'Separa pedidos por cantidad de pedidos por Bs. Una linea por cantidad puede conservar la unidad de precio usada para valorizar el peso real entregado.';

commit;
