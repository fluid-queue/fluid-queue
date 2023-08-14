import { performance as perf } from "node:perf_hooks";

declare global {
  // eslint-disable-next-line no-var
  var performance: typeof perf;
}
