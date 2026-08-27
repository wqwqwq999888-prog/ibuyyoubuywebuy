alter table public.orders
  add column if not exists logistics_trade_no text not null default '',
  add column if not exists logistics_status text not null default '',
  add column if not exists logistics_message text not null default '',
  add column if not exists logistics_created_at timestamptz;

create index if not exists orders_logistics_trade_no_idx
  on public.orders(logistics_trade_no)
  where logistics_trade_no <> '';
