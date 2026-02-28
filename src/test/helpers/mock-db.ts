/**
 * Lightweight mock database for testing Hono route handlers.
 *
 * Provides a chainable mock that matches Drizzle ORM's query builder API:
 *   db.select().from(table).where(condition)
 *   db.insert(table).values(data).returning()
 *   db.update(table).set(data).where(condition).returning()
 *   db.delete(table).where(condition).returning()
 */

import type { Database } from "@/lib/db";

interface MockDbState {
  selectResults: unknown[][];
  insertResults: unknown[][];
  updateResults: unknown[][];
  deleteResults: unknown[][];
  selectCallIndex: number;
  insertCallIndex: number;
  updateCallIndex: number;
  deleteCallIndex: number;
  calls: Array<{ type: string; args?: unknown[] }>;
}

export function createMockDb() {
  const state: MockDbState = {
    selectResults: [[]],
    insertResults: [[]],
    updateResults: [[]],
    deleteResults: [[]],
    selectCallIndex: 0,
    insertCallIndex: 0,
    updateCallIndex: 0,
    deleteCallIndex: 0,
    calls: [],
  };

  function createChain(resultGetter: () => unknown[]) {
    const chain: Record<string, any> = {};
    const methods = [
      "from", "where", "orderBy", "limit", "offset",
      "innerJoin", "leftJoin", "rightJoin",
      "set", "values", "returning",
      "onConflictDoUpdate", "onConflictDoNothing",
    ];
    for (const method of methods) {
      chain[method] = (..._args: unknown[]) => chain;
    }
    chain.then = (resolve: (val: unknown) => void, reject?: (err: unknown) => void) => {
      try {
        resolve(resultGetter());
      } catch (e) {
        reject?.(e);
      }
    };
    return chain;
  }

  const db = {
    select: (fields?: unknown) => {
      state.calls.push({ type: "select", args: fields ? [fields] : [] });
      const idx = state.selectCallIndex++;
      return createChain(() => state.selectResults[Math.min(idx, state.selectResults.length - 1)]);
    },
    insert: (table?: unknown) => {
      state.calls.push({ type: "insert", args: table ? [table] : [] });
      const idx = state.insertCallIndex++;
      return createChain(() => state.insertResults[Math.min(idx, state.insertResults.length - 1)]);
    },
    update: (table?: unknown) => {
      state.calls.push({ type: "update", args: table ? [table] : [] });
      const idx = state.updateCallIndex++;
      return createChain(() => state.updateResults[Math.min(idx, state.updateResults.length - 1)]);
    },
    delete: (table?: unknown) => {
      state.calls.push({ type: "delete", args: table ? [table] : [] });
      const idx = state.deleteCallIndex++;
      return createChain(() => state.deleteResults[Math.min(idx, state.deleteResults.length - 1)]);
    },
    run: async (_sql: unknown) => ({ results: [] }),
  } as unknown as Database;

  return {
    db,
    state,
    setSelectResults(...results: unknown[][]) {
      state.selectResults = results;
      state.selectCallIndex = 0;
    },
    setSelectResult(result: unknown[]) {
      state.selectResults = [result];
      state.selectCallIndex = 0;
    },
    setInsertResults(...results: unknown[][]) {
      state.insertResults = results;
      state.insertCallIndex = 0;
    },
    setInsertResult(result: unknown[]) {
      state.insertResults = [result];
      state.insertCallIndex = 0;
    },
    setUpdateResults(...results: unknown[][]) {
      state.updateResults = results;
      state.updateCallIndex = 0;
    },
    setUpdateResult(result: unknown[]) {
      state.updateResults = [result];
      state.updateCallIndex = 0;
    },
    setDeleteResults(...results: unknown[][]) {
      state.deleteResults = results;
      state.deleteCallIndex = 0;
    },
    setDeleteResult(result: unknown[]) {
      state.deleteResults = [result];
      state.deleteCallIndex = 0;
    },
    reset() {
      state.selectResults = [[]];
      state.insertResults = [[]];
      state.updateResults = [[]];
      state.deleteResults = [[]];
      state.selectCallIndex = 0;
      state.insertCallIndex = 0;
      state.updateCallIndex = 0;
      state.deleteCallIndex = 0;
      state.calls = [];
    },
    getCalls(type?: string) {
      if (type) return state.calls.filter((c) => c.type === type);
      return state.calls;
    },
  };
}
