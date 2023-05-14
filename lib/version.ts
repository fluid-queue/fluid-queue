// note: this file is used by the build.ts script and the queue src

export default function version() {
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
