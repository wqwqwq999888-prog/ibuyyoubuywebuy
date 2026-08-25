-- Reconcile databases that received an earlier, partial orders migration.
alter table public.orders
  add column if not exists customer_phone text not null default '',
  add column if not exists customer_email text not null default '',
  add column if not exists email_marketing_consent boolean not null default false,
  add column if not exists shipping_method text not null default '',
  add column if not exists shipping_details jsonb not null default '{}',
  add column if not exists transfer_last_five text not null default '',
  add column if not exists transfer_time timestamptz,
  add column if not exists trade_no text not null default '';

do $$
begin
  if exists (select 1 from information_schema.columns where table_schema='public' and table_name='orders' and column_name='order_status')
     and not exists (select 1 from information_schema.columns where table_schema='public' and table_name='orders' and column_name='shipping_status') then
    alter table public.orders rename column order_status to shipping_status;
  elsif not exists (select 1 from information_schema.columns where table_schema='public' and table_name='orders' and column_name='shipping_status') then
    alter table public.orders add column shipping_status text not null default '待出貨';
  end if;
end $$;

alter table public.orders
  add column if not exists gross_profit numeric(12,2)
  generated always as (order_amount - shipping_fee - product_cost) stored;

update public.orders set payment_status='待付款'
where payment_status not in ('待付款','已付款','已匯款待確認','付款失敗');
update public.orders set shipping_status='待出貨'
where shipping_status not in ('待出貨','已出貨','已完成');

do $$
begin
  if not exists (select 1 from pg_constraint where conrelid='public.orders'::regclass and conname='orders_payment_status_check') then
    alter table public.orders add constraint orders_payment_status_check check (payment_status in ('待付款','已付款','已匯款待確認','付款失敗'));
  end if;
  if not exists (select 1 from pg_constraint where conrelid='public.orders'::regclass and conname='orders_shipping_status_check') then
    alter table public.orders add constraint orders_shipping_status_check check (shipping_status in ('待出貨','已出貨','已完成'));
  end if;
end $$;

create table if not exists public.pending_ecpay_orders (
  order_no text primary key, payload jsonb not null, expected_amount integer not null check (expected_amount >= 0),
  created_at timestamptz not null default now(), expires_at timestamptz not null default now() + interval '1 day'
);
alter table public.pending_ecpay_orders enable row level security;
