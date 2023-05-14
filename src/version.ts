// note: this file is used by the build.ts script and the queue src

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

export function version() {
  // Return an empty string if there's no environment
  if (!process || !process.env) {
    return "";
  }

  // Use the Docker variables if they exist and this is the develop tag
  // (or the "this" tag which seems to be used for automated tests???)
  if (
    (process.env.DOCKER_TAG == "this" || process.env.DOCKER_TAG == "develop") &&
    process.env.SOURCE_COMMIT
  ) {
    return process.env.DOCKER_TAG + "-" + process.env.SOURCE_COMMIT.slice(0, 8);
  }

  // Use the NPM version if it's available
  if (process.env.npm_package_version != null) {
    return "version " + process.env.npm_package_version;
  }
  return "";
}
