import pg from "pg";

let _client: pg.Client | undefined;

export async function getClient(): Promise<pg.Client> {
  if (_client) return _client;

  const connectionString = process.env["DATABASE_URL"];
  if (!connectionString) throw new Error("DATABASE_URL não definido");

  _client = new pg.Client({ connectionString });
  await _client.connect();
  return _client;
}

export async function closeClient(): Promise<void> {
  if (_client) {
    await _client.end();
    _client = undefined;
  }
}

export async function query(sql: string, params?: unknown[]): Promise<pg.QueryResult> {
  const client = await getClient();
  return client.query(sql, params);
}
