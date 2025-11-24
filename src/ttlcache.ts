export type * from "@isaacs/ttlcache";
const { performance } = await import("node:perf_hooks");
// patching the performance object
globalThis.performance = performance;
export const { TTLCache } = await import("@isaacs/ttlcache");
