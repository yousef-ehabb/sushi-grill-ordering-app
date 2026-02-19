-- Atomic order + items insert for edge function place-order
-- Run this in InsForge SQL editor before deploying the updated place-order function.

create or replace function public.create_order_with_items(
  p_customer_name text,
  p_customer_phone text,
  p_address text,
  p_user_id uuid,
  p_type text,
  p_total numeric,
  p_items jsonb
)
returns table (id uuid, created_at timestamptz)
language plpgsql
security definer
as $$
declare
  v_order_id uuid;
  v_created_at timestamptz;
begin
  insert into public.orders (
    customer_name,
    customer_phone,
    address,
    user_id,
    type,
    total,
    status
  )
  values (
    p_customer_name,
    p_customer_phone,
    p_address,
    p_user_id,
    p_type,
    p_total,
    'new'
  )
  returning orders.id, orders.created_at into v_order_id, v_created_at;

  insert into public.order_items (
    order_id,
    product_id,
    name_ar,
    quantity,
    unit_price,
    special_instructions,
    selected_option_ids
  )
  select
    v_order_id,
    (elem->>'product_id')::uuid,
    elem->>'name_ar',
    (elem->>'quantity')::int,
    (elem->>'unit_price')::numeric,
    nullif(elem->>'special_instructions', ''),
    case
      when jsonb_typeof(elem->'selected_option_ids') = 'array' then
        array(select jsonb_array_elements_text(elem->'selected_option_ids'))::text[]
      else null
    end
  from jsonb_array_elements(p_items) as elem;

  return query select v_order_id, v_created_at;
end;
$$;
