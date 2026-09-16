-- Campaign attribution is stored in orders.shipping_details.campaign_id,
-- so a group-buy can operate without issuing a discount code.
alter table public.campaigns alter column discount_code drop not null;
