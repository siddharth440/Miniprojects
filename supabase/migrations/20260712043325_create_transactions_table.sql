/*
# Create transactions table (single-tenant, no auth)

1. New Tables
- `transactions`
  - `id` (uuid, primary key)
  - `amount` (numeric, not null, positive value)
  - `type` (text, not null, either 'expense' or 'income')
  - `description` (text, not null, short label for the transaction)
  - `category` (text, not null, grouping key like 'Food', 'Transport')
  - `date` (date, not null, the date the transaction occurred)
  - `created_at` (timestamptz, default now())
2. Indexes
- Index on `date` for time-range queries (monthly summaries, recent lists).
- Index on `category` for category breakdowns.
- Index on `type` for filtering income vs expense.
3. Security
- Enable RLS on `transactions`.
- Allow anon + authenticated CRUD because the data is intentionally shared/public (single-tenant app with no sign-in).
*/

CREATE TABLE IF NOT EXISTS transactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  amount numeric(12, 2) NOT NULL CHECK (amount > 0),
  type text NOT NULL CHECK (type IN ('expense', 'income')),
  description text NOT NULL,
  category text NOT NULL,
  date date NOT NULL,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_transactions_date ON transactions(date DESC);
CREATE INDEX IF NOT EXISTS idx_transactions_category ON transactions(category);
CREATE INDEX IF NOT EXISTS idx_transactions_type ON transactions(type);

ALTER TABLE transactions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "anon_select_transactions" ON transactions;
CREATE POLICY "anon_select_transactions"
  ON transactions FOR SELECT
  TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "anon_insert_transactions" ON transactions;
CREATE POLICY "anon_insert_transactions"
  ON transactions FOR INSERT
  TO anon, authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "anon_update_transactions" ON transactions;
CREATE POLICY "anon_update_transactions"
  ON transactions FOR UPDATE
  TO anon, authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "anon_delete_transactions" ON transactions;
CREATE POLICY "anon_delete_transactions"
  ON transactions FOR DELETE
  TO anon, authenticated USING (true);
