/**
 * A recording stand-in for a supabase-js client, for server-action unit tests.
 * Every chained call (.from().select().eq()...) is recorded; awaiting the chain
 * resolves to whatever `respond(call)` returns for it.
 */
export type FakeCall = { table: string; ops: Array<[string, unknown[]]> };
export type FakeResult = { data?: unknown; error?: { message: string; code?: string } | null; count?: number | null };

export interface FakeDb {
  calls: FakeCall[];
  respond: (call: FakeCall) => FakeResult;
  client: { from: (table: string) => unknown; rpc: (fn: string, args?: unknown) => unknown };
}

export function fakeDb(respond: (call: FakeCall) => FakeResult = () => ({ data: null, error: null })): FakeDb {
  const db: FakeDb = {
    calls: [],
    respond,
    client: {
      from: (table: string) => chain({ table, ops: [] }),
      rpc: (fn: string, args?: unknown) => chain({ table: `rpc:${fn}`, ops: [['rpc', [args]]] }),
    },
  };
  function chain(call: FakeCall): unknown {
    db.calls.push(call);
    const proxy: unknown = new Proxy(
      {},
      {
        get(_target, prop) {
          if (prop === 'then') {
            return (resolve: (v: FakeResult) => unknown, reject: (e: unknown) => unknown) =>
              Promise.resolve()
                .then(() => {
                  const r = db.respond(call);
                  return { data: r.data ?? null, error: r.error ?? null, count: r.count ?? null };
                })
                .then(resolve, reject);
          }
          return (...args: unknown[]) => {
            call.ops.push([String(prop), args]);
            return proxy;
          };
        },
      },
    );
    return proxy;
  }
  return db;
}

/** The recorded calls to `table` that include operation `op`. */
export function callsTo(db: FakeDb, table: string, op?: string): FakeCall[] {
  return db.calls.filter((c) => c.table === table && (!op || c.ops.some(([name]) => name === op)));
}

/** Whether a call filtered `column` with .eq(column, value). */
export function hasEq(call: FakeCall, column: string, value: unknown): boolean {
  return call.ops.some(([name, args]) => name === 'eq' && args[0] === column && args[1] === value);
}
