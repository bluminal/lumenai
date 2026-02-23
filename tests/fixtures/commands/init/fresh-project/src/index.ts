import express from 'express';
import { Pool } from 'pg';

const app = express();
const port = process.env.PORT || 3000;

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

app.use(express.json());

app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

app.get('/api/inventory', async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT id, sku, name, quantity, warehouse_id FROM inventory ORDER BY updated_at DESC LIMIT 100'
    );
    res.json({ data: result.rows });
  } catch (error) {
    console.error('Failed to fetch inventory:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.listen(port, () => {
  console.log(`Inventory service listening on port ${port}`);
});
