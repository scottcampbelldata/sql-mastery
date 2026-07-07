import fs from 'fs';

import { DbClient } from './types';

export async function runSqlFile(client: DbClient, absPath: string): Promise<void> {
  const sql = fs.readFileSync(absPath, 'utf8');
  await client.query(sql);
}
