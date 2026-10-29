// Makes the consultations tables in the database of DATABASE_URL: npm run db, after Better Auth has made its own.
import { readFileSync } from 'node:fs';
import pg from 'pg';

const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
await client.connect();
await client.query(readFileSync(new URL('./schema.sql', import.meta.url), 'utf8'));
await client.end();
console.log('The consultations tables are ready.');
