-- No order/notification is created by this migration. Only the service role
-- may claim work or update monitoring results; clients go through admin API.
alter table public.pending_ecpay_orders
  add column if not exists last_checked_at timestamptz,
  add column if not exists next_check_at timestamptz not null default now(),
  add column if not exists check_status text not null default 'unchecked',
  add column if not exists check_error text,
  add column if not exists alerted_at timestamptz,
  add column if not exists review_required boolean not null default false;
create index if not exists pending_payment_check_idx on public.pending_ecpay_orders(next_check_at);
create table if not exists public.payment_monitor_state (
  id integer primary key check (id=1), last_run_at timestamptz,
  last_error text, cooldown_until timestamptz
);
alter table public.payment_monitor_state enable row level security;
insert into public.payment_monitor_state(id) values(1) on conflict do nothing;
create or replace function public.claim_payment_checks()
returns setof public.pending_ecpay_orders
language sql security definer set search_path = public
as $$
  with candidates as (
    select order_no from public.pending_ecpay_orders
    where created_at <= now() - interval '10 minutes'
      and next_check_at <= now()
      and not exists(select 1 from public.payment_monitor_state where cooldown_until > now())
    order by next_check_at, created_at
    limit 3 for update skip locked
  )
  update public.pending_ecpay_orders p
  set next_check_at = now() + interval '10 minutes'
  from candidates c where p.order_no=c.order_no returning p.*;
$$;
revoke all on function public.claim_payment_checks() from public, anon, authenticated;
grant execute on function public.claim_payment_checks() to service_role;
revoke all on public.payment_monitor_state from anon, authenticated;
grant all on public.payment_monitor_state to service_role;
