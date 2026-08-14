import { neon } from "@neondatabase/serverless";
import { NextResponse } from "next/server";

export async function GET() {
  try {
    const sql = neon(process.env.DATABASE_URL!);
    await sql`CREATE TABLE IF NOT EXISTS test_table (id SERIAL PRIMARY KEY, message TEXT)`;
    await sql`INSERT INTO test_table (message) VALUES ('hello from axisero pipeline test')`;
    const rows = await sql`SELECT * FROM test_table ORDER BY id DESC LIMIT 1`;
    return NextResponse.json({ ok: true, latestRow: rows[0] });
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : String(err) },
      { status: 500 }
    );
  }
}