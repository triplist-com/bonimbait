/**
 * A tiny in-memory stand-in for the PostgREST query builder, enough for the
 * revenue server code under test: select / eq / in / gte / lte / order /
 * limit / maybeSingle / single, awaited directly. Writes are recorded.
 */
type Row = Record<string, unknown>;

export type FakeDb = {
  from(table: string): FakeQuery;
  rpc(name: string, args: Record<string, unknown>): Promise<{ data: unknown; error: null | { message: string } }>;
  writes: Array<{ table: string; op: 'insert' | 'update' | 'upsert' | 'delete'; values: unknown; filters: Array<[string, unknown]> }>;
};

type FakeQuery = PromiseLike<{ data: Row[]; error: null }> & {
  select(cols?: string): FakeQuery;
  eq(col: string, value: unknown): FakeQuery;
  neq(col: string, value: unknown): FakeQuery;
  in(col: string, values: unknown[]): FakeQuery;
  gte(col: string, value: unknown): FakeQuery;
  lte(col: string, value: unknown): FakeQuery;
  order(col: string, opts?: unknown): FakeQuery;
  limit(n: number): FakeQuery;
  insert(values: unknown): FakeQuery;
  update(values: unknown): FakeQuery;
  upsert(values: unknown): FakeQuery;
  delete(): FakeQuery;
  maybeSingle(): Promise<{ data: Row | null; error: null }>;
  single(): Promise<{ data: Row | null; error: null | { message: string } }>;
};

export function fakeDb(
  tables: Record<string, Row[]>,
  rpcs: Record<string, (args: Record<string, unknown>) => unknown> = {},
): FakeDb {
  const writes: FakeDb['writes'] = [];
  const db: FakeDb = {
    writes,
    from(table: string) {
      let rows = [...(tables[table] ?? [])];
      const filters: Array<[string, unknown]> = [];
      let write: FakeDb['writes'][number] | null = null;
      const q: FakeQuery = {
        select: () => q,
        eq: (col, value) => {
          filters.push([col, value]);
          rows = rows.filter((r) => r[col] === value);
          return q;
        },
        neq: (col, value) => {
          rows = rows.filter((r) => r[col] !== value);
          return q;
        },
        in: (col, values) => {
          rows = rows.filter((r) => values.includes(r[col]));
          return q;
        },
        gte: (col, value) => {
          rows = rows.filter((r) => String(r[col]) >= String(value));
          return q;
        },
        lte: (col, value) => {
          rows = rows.filter((r) => String(r[col]) <= String(value));
          return q;
        },
        order: () => q,
        limit: (n) => {
          rows = rows.slice(0, n);
          return q;
        },
        insert: (values) => {
          write = { table, op: 'insert', values, filters };
          writes.push(write);
          rows = (Array.isArray(values) ? values : [values]) as Row[];
          return q;
        },
        update: (values) => {
          write = { table, op: 'update', values, filters };
          writes.push(write);
          return q;
        },
        upsert: (values) => {
          write = { table, op: 'upsert', values, filters };
          writes.push(write);
          return q;
        },
        delete: () => {
          write = { table, op: 'delete', values: null, filters };
          writes.push(write);
          return q;
        },
        maybeSingle: async () => ({ data: rows[0] ?? null, error: null }),
        single: async () => (rows[0] ? { data: rows[0], error: null } : { data: null, error: { message: 'not found' } }),
        then: (onFulfilled, onRejected) => Promise.resolve({ data: rows, error: null }).then(onFulfilled, onRejected),
      };
      return q;
    },
    async rpc(name, args) {
      const fn = rpcs[name];
      if (!fn) return { data: null, error: { message: `no rpc ${name}` } };
      return { data: fn(args), error: null };
    },
  };
  return db;
}
