const bannerTemplate = ` ___  _          _      _
/  _|| |        |_|    | | ###################################
| |_ | |  _   _  _  ___| |     _____  _   _  ____  _   _  ____
|  _|| | | | | || |/  _  | ___|  _  || | | ||  _ || | | ||  _ |
| |  | |_| |_| || || |_| |/__/| |_| || |_| ||  __/| |_| ||  __/
|_|  |__/|_____/|_/|_____/    \\___  ||_____/|____||_____/|____|
                                  | |
 ~ ><))°> o° .  ~ ><))°> ~   o°  .|_|  ~ ><))°>  °o ><))°> o( )°
`;

const version = () => {
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
};

const printBanner = () => {
  try {
    const banner = bannerTemplate.replace(/#+/g, (characters) =>
      version().padStart(characters.length, " ")
    );
    console.log(banner);
  } catch (e) {
    // ignore error
  }
};

module.exports = {
  printBanner,
};
