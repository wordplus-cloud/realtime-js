import { Pool } from 'pg';
import { WORLDS, withWorlds } from './worlds';

// One pool for the whole app: Better Auth keeps its accounts in it, and lib/club.ts the profiles, channels, lounges,
// events and messages.
// Kept on globalThis so that reloads in development do not open a new pool each time.
const shared = globalThis as unknown as { pool?: Pool };
const pool = (shared.pool ??= new Pool({ connectionString: process.env.DATABASE_URL }));

// The public demo gives each visitor a copy of the ready-made club of their own (lib/worlds.ts).
export const db = WORLDS ? withWorlds(pool) : pool;
