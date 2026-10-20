// note: this file is used by the build.ts script and the queue src
export function buildVersion(): string | null {
  if (
    (process.env.DOCKER_TAG == "this" || process.env.DOCKER_TAG == "develop") &&
    process.env.SOURCE_COMMIT
  ) {
    // If we're running in Docker on the develop branch,
    // this needs to be the develop-abcdef version number.
    // Otherwise users will always see an error.
    return version();
  }
  if (__build_version != null && __build_version != "") {
    return __build_version;
  }
  return null;
}

export function buildTag(): string | null {
  if (__build_tag != null && __build_tag != "") {
    return __build_tag;
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
