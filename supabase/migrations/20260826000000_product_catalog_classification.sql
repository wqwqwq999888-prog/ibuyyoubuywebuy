-- 商品分類必須由資料決定，前台不再靠商品編號猜測顯示區域。
alter table public.products
  add column if not exists product_type text not null default 'single',
  add column if not exists combo_contents text not null default '';

update public.products
set product_type = 'combo'
where product_no in ('200001', '200002', '200003');

update public.products set combo_contents = '經典蜜汁、台式蒜香、泰式酸辣'
where product_no = '200001' and combo_contents = '';
update public.products set combo_contents = '經典蜜汁、川辣、嚴選胡椒'
where product_no = '200002' and combo_contents = '';
update public.products set combo_contents = '經典蜜汁、波波魚卵、奢華松露'
where product_no = '200003' and combo_contents = '';

alter table public.products drop constraint if exists products_product_type_check;
alter table public.products
  add constraint products_product_type_check
  check (product_type in ('single', 'combo'));
