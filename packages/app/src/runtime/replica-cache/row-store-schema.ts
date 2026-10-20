// v2 adds per-host row/byte summaries so the cache can budget without loading
// every payload at startup.
export const REPLICA_ROW_STORE_SCHEMA_VERSION = 2;

export const REPLICA_SINGLETON_ROW_ID = "singleton";
