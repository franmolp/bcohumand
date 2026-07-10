CREATE TABLE IF NOT EXISTS loyverse_tickets (
  id              text PRIMARY KEY,  -- receipt_number de Loyverse
  receipt_date    timestamptz NOT NULL,
  item_name       text NOT NULL DEFAULT '',
  categoria       text NOT NULL DEFAULT '',
  profesional     text NOT NULL DEFAULT '',
  total_money     numeric(10,2) NOT NULL DEFAULT 0,
  total_discount  numeric(10,2) NOT NULL DEFAULT 0,
  payment_type    text NOT NULL DEFAULT '',
  store_id        text NOT NULL DEFAULT '',
  created_at      timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_lt_fecha      ON loyverse_tickets (receipt_date);
CREATE INDEX IF NOT EXISTS idx_lt_profesional ON loyverse_tickets (profesional);

GRANT ALL ON TABLE loyverse_tickets TO anon, authenticated, service_role;
