'use strict';

/**
 * Product Shop — Backend REST API
 * Stack: Node.js 20 + Express + PostgreSQL (pg) + Redis + Prometheus (prom-client)
 * Endpointy:
 *   GET  /health          — liveness check (zawsze 200)
 *   GET  /ready           — readiness check (sprawdza DB + Redis)
 *   GET  /metrics         — metryki Prometheus
 *   GET  /products        — lista produktów (cache Redis 5 min)
 *   POST /products        — dodaj produkt (inwaliduje cache)
 *   GET  /products/:id    — jeden produkt
 *   DELETE /products/:id  — usuń produkt (inwaliduje cache)
 */

const express    = require('express');
const { Pool }   = require('pg');
const { createClient } = require('redis');
const promClient = require('prom-client');

const register = new promClient.Registry();
promClient.collectDefaultMetrics({ register });

const httpRequests = new promClient.Counter({
  name: 'http_requests_total',
  help: 'Total number of HTTP requests',
  labelNames: ['method', 'route', 'status_code'],
  registers: [register],
});

const PORT       = parseInt(process.env.PORT       || '3000');
const DB_HOST    = process.env.DB_HOST    || 'postgres';
const DB_PORT    = parseInt(process.env.DB_PORT    || '5432');
const DB_NAME    = process.env.DB_NAME    || 'shop';
const DB_USER    = process.env.DB_USER    || 'shop';
const DB_PASS    = process.env.DB_PASS    || 'shoppassword';
const REDIS_HOST = process.env.REDIS_HOST || 'redis';
const REDIS_PORT = parseInt(process.env.REDIS_PORT || '6379');

const pool = new Pool({
  host: DB_HOST, port: DB_PORT,
  database: DB_NAME, user: DB_USER, password: DB_PASS,
});

let redis;

async function connectRedis() {
  redis = createClient({ socket: { host: REDIS_HOST, port: REDIS_PORT } });
  redis.on('error', err => console.error('[redis] error:', err.message));
  await redis.connect();
  console.log('[redis] connected to', REDIS_HOST + ':' + REDIS_PORT);
}

const app = express();
app.use(express.json());

app.get('/health', (_req, res) => {
  res.json({ status: 'ok', service: 'backend-api', version: process.env.VERSION || '1.0.0' });
});

app.get('/ready', async (_req, res) => {
  try {
    await pool.query('SELECT 1');
    await redis.ping();
    res.json({ status: 'ready' });
  } catch (err) {
    res.status(503).json({ status: 'not ready', error: err.message });
  }
});

app.get('/metrics', async (_req, res) => {
  res.set('Content-Type', register.contentType);
  res.end(await register.metrics());
});

const CACHE_KEY = 'products:all';
const CACHE_TTL = 300; // 5 minut

// GET /products — lista (z cache Redis)
app.get('/products', async (_req, res) => {
  try {
    const cached = await redis.get(CACHE_KEY);
    if (cached) {
      httpRequests.labels('GET', '/products', '200').inc();
      return res.json(JSON.parse(cached));
    }
    const { rows } = await pool.query(
      'SELECT id, name, price::float, description, in_stock, created_at::text FROM products ORDER BY id'
    );
    await redis.setEx(CACHE_KEY, CACHE_TTL, JSON.stringify(rows));
    httpRequests.labels('GET', '/products', '200').inc();
    res.json(rows);
  } catch (err) {
    console.error('[GET /products]', err.message);
    res.status(500).json({ error: err.message });
  }
});

// POST /products — dodaj produkt
app.post('/products', async (req, res) => {
  const { name, price, description = '', in_stock = true } = req.body;
  if (!name || price === undefined) {
    return res.status(400).json({ error: 'Wymagane pola: name, price' });
  }
  try {
    const { rows } = await pool.query(
      `INSERT INTO products (name, price, description, in_stock)
       VALUES ($1, $2, $3, $4)
       RETURNING id, name, price::float, description, in_stock, created_at::text`,
      [name, Number(price), description, Boolean(in_stock)]
    );
    await redis.del(CACHE_KEY); // inwalidacja cache po mutacji
    httpRequests.labels('POST', '/products', '201').inc();
    res.status(201).json(rows[0]);
  } catch (err) {
    console.error('[POST /products]', err.message);
    res.status(500).json({ error: err.message });
  }
});

// GET /products/:id — jeden produkt
app.get('/products/:id', async (req, res) => {
  try {
    const { rows } = await pool.query(
      'SELECT id, name, price::float, description, in_stock, created_at::text FROM products WHERE id = $1',
      [parseInt(req.params.id)]
    );
    if (!rows.length) return res.status(404).json({ error: 'Produkt nie znaleziony' });
    httpRequests.labels('GET', '/products/:id', '200').inc();
    res.json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /products/:id — usuń produkt
app.delete('/products/:id', async (req, res) => {
  try {
    const result = await pool.query(
      'DELETE FROM products WHERE id = $1', [parseInt(req.params.id)]
    );
    if (result.rowCount === 0) return res.status(404).json({ error: 'Produkt nie znaleziony' });
    await redis.del(CACHE_KEY);
    httpRequests.labels('DELETE', '/products/:id', '204').inc();
    res.status(204).end();
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

(async () => {
  await connectRedis();
  app.listen(PORT, '0.0.0.0', () => {
    console.log(`[${new Date().toISOString()}] Server nasłuchuje na porcie ${PORT}`);
  });
})().catch(err => {
  console.error('[fatal]', err);
  process.exit(1);
});
