-- Tabla de pagos por recibo (para totales y desglose por medio de pago exactos)
-- Un row por (recibo × medio de pago). REFUND receipts se guardan con payment_money negativo.
CREATE TABLE IF NOT EXISTS loyverse_pagos (
  receipt_number text        NOT NULL,
  receipt_date   timestamptz NOT NULL,
  payment_name   text        NOT NULL DEFAULT '',
  payment_money  numeric(10,2) NOT NULL DEFAULT 0,
  PRIMARY KEY (receipt_number, payment_name)
);

CREATE INDEX IF NOT EXISTS idx_lp_fecha ON loyverse_pagos (receipt_date);

GRANT ALL ON TABLE loyverse_pagos TO anon, authenticated, service_role;
