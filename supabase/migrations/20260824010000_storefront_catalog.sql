alter table public.products add column if not exists product_type text not null default 'single'
  check (product_type in ('single','combo'));
alter table public.products add column if not exists combo_items jsonb not null default '[]'::jsonb;
alter table public.discounts add column if not exists applicable_product_nos text[] not null default '{}';

-- Drop first so the migration is safe to rerun from the Supabase SQL editor.
-- The storefront must be able to read configuration, but never receives admin write access.
drop policy if exists "public reads discounts" on public.discounts;
create policy "public reads discounts" on public.discounts for select using (true);
drop policy if exists "public reads campaigns" on public.campaigns;
create policy "public reads campaigns" on public.campaigns for select using (enabled or public.is_admin());

update public.products set product_type='combo'
where product_no like '2%' and product_type='single';
