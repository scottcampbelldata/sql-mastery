import { Pool } from 'pg';

import { buildClientConfig } from '../../db-config';
import { runSqlFile } from './schema';
import { DatasetModule, DbClient } from './types';
import { insertRows } from './writer';

export async function seedDatabase(mod: DatasetModule): Promise<Record<string, number>> {
  const pool = new Pool(buildClientConfig(mod.DB_NAME, process.env));
  const client = await pool.connect();
  const dbClient = client as unknown as DbClient;

  try {
    await client.query('BEGIN');
    await runSqlFile(dbClient, mod.SCHEMA_FILE);

    const data = mod.generate(mod.SEED);
    const counts: Record<string, number> = {};

    for (const t of mod.TABLES) {
      const rows = data[t.name] || [];
      await insertRows(dbClient, t.name, t.columns, rows);
      counts[t.name] = rows.length;
      if (rows.length > 5000) {
        console.log(`  seeded ${t.name}: ${rows.length}`);
      }
    }

    await client.query(
      'INSERT INTO seed_meta (db, version, seed, row_counts) VALUES ($1, $2, $3, $4)',
      [mod.DB_NAME, mod.VERSION, mod.SEED, JSON.stringify(counts)]
    );

    await client.query('COMMIT');
    return counts;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
    await pool.end();
  }
}
