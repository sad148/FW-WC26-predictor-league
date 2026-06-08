import { neon } from '@neondatabase/serverless';
const sql = neon(process.env.DATABASE_URL);
const [qp, bp] = await Promise.all([
  sql`SELECT * FROM question_phases`,
  sql`SELECT * FROM bracket_phases`,
]);
console.log('question_phases:', JSON.stringify(qp, null, 2));
console.log('bracket_phases:', JSON.stringify(bp, null, 2));
