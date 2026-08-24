create extension if not exists pgcrypto;

create table public.admin_users (
  user_id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null default '',
  created_at timestamptz not null default now()
);

create table public.products (
  product_no text primary key check (product_no ~ '^[0-9]+$'),
  name text not null check (length(trim(name)) > 0),
  price integer not null check (price >= 0),
  cost numeric(12,2) not null default 0 check (cost >= 0),
  specification text not null default '200 克／包',
  description text not null default '',
  image_url text not null default '',
  sort_order integer not null default 0,
  enabled boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.shipping_methods (
  id text primary key,
  name text not null,
  fee integer not null check (fee >= 0),
  free_threshold integer not null check (free_threshold >= 0),
  enabled boolean not null default true,
  sort_order integer not null default 0,
  updated_at timestamptz not null default now()
);

create table public.discounts (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  code text not null unique check (code = upper(code)),
  discount_type text not null check (discount_type in ('fixed','percent')),
  discount_value numeric(12,2) not null check (discount_value > 0),
  minimum_amount integer not null default 0 check (minimum_amount >= 0),
  usage_limit integer not null default 0 check (usage_limit >= 0),
  starts_at timestamptz,
  ends_at timestamptz,
  enabled boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (ends_at is null or starts_at is null or ends_at > starts_at),
  check (discount_type <> 'percent' or discount_value <= 10)
);

create table public.campaigns (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  partner_name text not null,
  slug text not null unique check (slug ~ '^[a-z0-9-]+$'),
  discount_code text not null references public.discounts(code) on update cascade,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  enabled boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (ends_at > starts_at)
);

create or replace function public.is_admin()
returns boolean language sql stable security definer set search_path = public
as $$ select exists(select 1 from public.admin_users where user_id = auth.uid()) $$;

create or replace function public.set_updated_at()
returns trigger language plpgsql as $$ begin new.updated_at = now(); return new; end $$;

create trigger products_updated_at before update on public.products for each row execute function public.set_updated_at();
create trigger shipping_updated_at before update on public.shipping_methods for each row execute function public.set_updated_at();
create trigger discounts_updated_at before update on public.discounts for each row execute function public.set_updated_at();
create trigger campaigns_updated_at before update on public.campaigns for each row execute function public.set_updated_at();

alter table public.admin_users enable row level security;
alter table public.products enable row level security;
alter table public.shipping_methods enable row level security;
alter table public.discounts enable row level security;
alter table public.campaigns enable row level security;

create policy "admins read own access" on public.admin_users for select using (user_id = auth.uid());
create policy "public reads active products" on public.products for select using (enabled or public.is_admin());
create policy "admins manage products" on public.products for all using (public.is_admin()) with check (public.is_admin());
create policy "public reads enabled shipping" on public.shipping_methods for select using (enabled or public.is_admin());
create policy "admins manage shipping" on public.shipping_methods for all using (public.is_admin()) with check (public.is_admin());
create policy "admins manage discounts" on public.discounts for all using (public.is_admin()) with check (public.is_admin());
create policy "admins manage campaigns" on public.campaigns for all using (public.is_admin()) with check (public.is_admin());

insert into public.shipping_methods(id,name,fee,free_threshold,enabled,sort_order) values
  ('711','7-ELEVEN',65,1500,true,1),
  ('family','全家',65,1500,true,2),
  ('kuroneko','黑貓宅配',130,3000,true,3)
on conflict (id) do nothing;

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values ('product-images','product-images',true,5242880,array['image/jpeg','image/png','image/webp'])
on conflict (id) do nothing;

create policy "public reads product images" on storage.objects for select using (bucket_id = 'product-images');
create policy "admins upload product images" on storage.objects for insert with check (bucket_id = 'product-images' and public.is_admin());
create policy "admins update product images" on storage.objects for update using (bucket_id = 'product-images' and public.is_admin());
create policy "admins delete product images" on storage.objects for delete using (bucket_id = 'product-images' and public.is_admin());
