import dotenv from 'dotenv';
import type { Config } from 'drizzle-kit';

// Next.js loads .env.local automatically at runtime; drizzle-kit doesn't, so load it here.
dotenv.config({ path: '.env.local' });

export default {
  schema: './src/db/schema.ts',
  out: './drizzle',
  dialect: 'postgresql',
  dbCredentials: {
    url: process.env.DATABASE_URL!,
  },
} satisfies Config;
