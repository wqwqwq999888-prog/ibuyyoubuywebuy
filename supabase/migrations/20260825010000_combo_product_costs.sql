-- Only fill legacy zero defaults; never overwrite costs already maintained by an administrator.
update public.products set cost = case product_no
  when '200001' then 241.50
  when '200002' then 241.50
  when '200003' then 296.50
end
where product_no in ('200001','200002','200003') and cost = 0;
