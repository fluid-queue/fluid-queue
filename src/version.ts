// note: this file is also used by the build.ts script

import version from "../lib/version.js";

// TODO: find a way to allow var for global declarations
declare global {
  // eslint-disable-next-line no-var
  var __build_version: string | undefined;
  // eslint-disable-next-line no-var
  var __build_tag: string | undefined;
}

export function buildVersion(): string | null {
  if (globalThis.__build_version != null && globalThis.__build_version != "") {
    return globalThis.__build_version;
  }
  return null;
}

export function buildTag(): string | null {
  if (globalThis.__build_tag != null && globalThis.__build_tag != "") {
    return globalThis.__build_tag;
  }
  return null;
}

export { version };
