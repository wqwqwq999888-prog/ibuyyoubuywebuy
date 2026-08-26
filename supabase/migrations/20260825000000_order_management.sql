alter table public.orders rename column order_status to shipping_status;
alter table public.orders
  add column customer_name text not null default '', add column customer_phone text not null default '',
  add column customer_email text not null default '', add column email_marketing_consent boolean not null default false,
  add column items jsonb not null default '[]', add column shipping_method text not null default '',
  add column shipping_details jsonb not null default '{}', add column transfer_last_five text not null default '',
  add column transfer_time timestamptz, add column note text not null default '', add column payment_method text not null default '',
  add column trade_no text not null default '', add column product_cost numeric(12,2) not null default 0,
  add column shipped_at timestamptz, add column completed_at timestamptz,
  add column gross_profit numeric(12,2) generated always as (order_amount - shipping_fee - product_cost) stored;

alter table public.orders add constraint orders_payment_status_check
  check (payment_status in ('待付款','已付款','已匯款待確認','付款失敗'));
alter table public.orders add constraint orders_shipping_status_check check (shipping_status in ('待出貨','已出貨','已完成'));
alter table public.orders add constraint orders_transfer_last_five_check check (transfer_last_five = '' or transfer_last_five ~ '^\d{5}$');

create index orders_created_at_idx on public.orders(created_at desc);
create index orders_payment_status_idx on public.orders(payment_status);
create index orders_shipping_status_idx on public.orders(shipping_status);

create table public.pending_ecpay_orders (
  order_no text primary key, payload jsonb not null, expected_amount integer not null check (expected_amount >= 0),
  created_at timestamptz not null default now(), expires_at timestamptz not null default now() + interval '1 day'
);
alter table public.pending_ecpay_orders enable row level security;
