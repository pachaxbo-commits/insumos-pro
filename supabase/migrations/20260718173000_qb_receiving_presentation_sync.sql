-- Keep the presentation-level reception permission and its operational source
-- relation aligned. This does not duplicate or modify presentations.

begin;

create or replace function public.sync_qb_receiving_presentation_source()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog
as $$
begin
  if new.is_active and new.allow_purchase then
    insert into public.qb_product_allowed_units (
      product_id,
      usage_context,
      presentation_id,
      is_default,
      quantity_step,
      min_quantity,
      is_active,
      sort_order,
      notes,
      created_by,
      updated_by
    ) values (
      new.product_id,
      'recepcion',
      new.id,
      false,
      1,
      1,
      true,
      new.sort_order,
      'Sincronizada desde el permiso de recepcion de la presentacion.',
      new.created_by,
      new.updated_by
    )
    on conflict (product_id, usage_context, presentation_id)
      where presentation_id is not null
    do update set
      is_active = true,
      sort_order = excluded.sort_order,
      updated_by = excluded.updated_by,
      updated_at = pg_catalog.now();
  else
    update public.qb_product_allowed_units
    set is_active = false,
        updated_by = new.updated_by,
        updated_at = pg_catalog.now()
    where product_id = new.product_id
      and usage_context = 'recepcion'
      and presentation_id = new.id
      and is_active = true;
  end if;

  return new;
end;
$$;

revoke all on function public.sync_qb_receiving_presentation_source()
from public, anon, authenticated;

drop trigger if exists sync_qb_receiving_presentation_source
on public.qb_product_presentations;

create trigger sync_qb_receiving_presentation_source
after insert or update of allow_purchase, is_active, sort_order
on public.qb_product_presentations
for each row
execute function public.sync_qb_receiving_presentation_source();

insert into public.qb_product_allowed_units (
  product_id,
  usage_context,
  presentation_id,
  is_default,
  quantity_step,
  min_quantity,
  is_active,
  sort_order,
  notes,
  created_by,
  updated_by
)
select
  presentation.product_id,
  'recepcion',
  presentation.id,
  false,
  1,
  1,
  true,
  presentation.sort_order,
  'Sincronizada desde el permiso de recepcion de la presentacion.',
  presentation.created_by,
  presentation.updated_by
from public.qb_product_presentations presentation
where presentation.is_active = true
  and presentation.allow_purchase = true
on conflict (product_id, usage_context, presentation_id)
  where presentation_id is not null
do update set
  is_active = true,
  sort_order = excluded.sort_order,
  updated_by = excluded.updated_by,
  updated_at = pg_catalog.now();

comment on function public.sync_qb_receiving_presentation_source() is
  'Ensures an active allow_purchase presentation has exactly one active recepcion source relation.';

commit;
