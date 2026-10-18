// Minimal ambient typing for Node's built-in `node:sqlite` module.
//
// The plugins workspace is typechecked against `@types/node@20`, which predates
// `node:sqlite` (added in Node 22.5.0). We only surface the synchronous surface
// the registry uses. Delete this file once the workspace moves to
// `@types/node@^22`, which ships its own declarations.

declare module "node:sqlite" {
  type SQLInputValue = null | number | bigint | string | Uint8Array;

  interface StatementResultingChanges {
    changes: number | bigint;
    lastInsertRowid: number | bigint;
  }

  class StatementSync {
    all(...anonymousParameters: SQLInputValue[]): unknown[];
    get(...anonymousParameters: SQLInputValue[]): unknown;
    run(...anonymousParameters: SQLInputValue[]): StatementResultingChanges;
    iterate(...anonymousParameters: SQLInputValue[]): IterableIterator<unknown>;
    setAllowBareNamedParameters(enabled: boolean): void;
  }

  interface DatabaseSyncOptions {
    open?: boolean;
    readOnly?: boolean;
    enableForeignKeyConstraints?: boolean;
    enableDoubleQuotedStringLiterals?: boolean;
    allowExtension?: boolean;
  }

  class DatabaseSync {
    constructor(location: string, options?: DatabaseSyncOptions);
    close(): void;
    exec(sql: string): void;
    prepare(sql: string): StatementSync;
    isOpen?: boolean;
  }

  const constants: Record<string, number>;
  export { DatabaseSync, StatementSync, constants };
  export type { DatabaseSyncOptions, SQLInputValue, StatementResultingChanges };
}
