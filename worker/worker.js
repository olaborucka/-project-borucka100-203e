'use strict';

/**
 * Product Shop — Worker
 * Co WORKER_INTERVAL sekund (domyślnie 60) pobiera statystyki produktów
 * z PostgreSQL i zapisuje je do Redis pod kluczem stats:products.
 *
 * Dowód działania (CHECKLIST.md):
 *   kubectl exec -it deploy/worker -n shop -- sh
 *   # wewnątrz kontenera: (lub przez redis-cli z innego poda)
 *   redis-cli -h redis GET stats:products
 */

const { Pool }         = require('pg');
const { createClient } = require('redis');

const INTERVAL_MS = parseInt(process.env.WORKER_INTERVAL || '60') * 1000;

const log = msg => console.log(`[${new Date().toISOString()}] ${msg}`);

const pool = new Pool({
  host:     process.env.DB_HOST   || 'postgres',
  port:     parseInt(process.env.DB_PORT || '5432'),
  database: process.env.DB_NAME   || 'shop',
  user:     process.env.DB_USER   || 'shop',
  password: process.env.DB_PASS   || 'shoppassword',
});

async function run() {
  log(`Worker uruchomiony. Interwał: ${INTERVAL_MS / 1000}s`);

  // połącz z Redis (ponawiaj przy błędzie)
  const redis = createClient({
    socket: {
      host: process.env.REDIS_HOST || 'redis',
      port: parseInt(process.env.REDIS_PORT || '6379'),
    },
  });
  redis.on('error', err => console.error('[redis] error:', err.message));
  await redis.connect();
  log('Połączono z Redis');

  while (true) {
    try {
      // pobierz agregaty z PostgreSQL
      const { rows } = await pool.query(`
        SELECT
          COUNT(*)::int                                  AS total_products,
          COUNT(*) FILTER (WHERE in_stock = true)::int   AS in_stock,
          COUNT(*) FILTER (WHERE in_stock = false)::int  AS out_of_stock,
          ROUND(AVG(price)::numeric, 2)::float           AS avg_price
        FROM products
      `);

      // ostatnio dodany produkt
      const newest = await pool.query(
        'SELECT id, name FROM products ORDER BY created_at DESC LIMIT 1'
      );

      const stats = {
        ...rows[0],
        last_product_id:   newest.rows[0]?.id   ?? null,
        last_product_name: newest.rows[0]?.name ?? null,
        worker_ts: Math.floor(Date.now() / 1000),
      };

      // zapisz do Redis (bez TTL — worker sam aktualizuje)
      await redis.set('stats:products', JSON.stringify(stats));
      log(`Statystyki zaktualizowane: ${JSON.stringify(stats)}`);

    } catch (err) {
      console.error(`[${new Date().toISOString()}] Błąd workera:`, err.message);
    }

    await new Promise(resolve => setTimeout(resolve, INTERVAL_MS));
  }
}

run().catch(err => {
  console.error('[fatal]', err);
  process.exit(1);
});
