-- Fecha/hora en la que un ítem de pedido se marcó recibido o faltante, para poder
-- mostrar "fecha de recibido" en el título de cada pedido de la pestaña "Ya pedido"
-- (antes solo se sabía la fecha en que se archivó/envió el pedido, no cuándo llegó).
ALTER TABLE pedidos_items ADD COLUMN IF NOT EXISTS recibido_en TIMESTAMPTZ;
