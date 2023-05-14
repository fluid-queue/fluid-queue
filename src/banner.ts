import { version, buildVersion, buildTag } from "./version.js";

const bannerTemplate = ` ___  _          _      _
/  _|| |        |_|    | | ###################################
| |_ | |  _   _  _  ___| |     _____  _   _  ____  _   _  ____
|  _|| | | | | || |/  _  | ___|  _  || | | ||  _ || | | ||  _ |
| |  | |_| |_| || || |_| |/__/| |_| || |_| ||  __/| |_| ||  __/
|_|  |__/|_____/|_/|_____/    \\___  ||_____/|____||_____/|____|
                                  | |
 ~ ><))°> o° .  ~ ><))°> ~   o°  .|_|  ~ ><))°>  °o ><))°> o( )°
`;

const displayVersion = () => {
  const buildV = buildVersion();
  if (buildV == null) {
    return version();
  }
  const buildT = buildTag();
  if (buildT == null) {
    return buildV;
  }
  return `${buildV} (${buildT})`;
};

const checkVersion = (): boolean | null => {
  const buildV = buildVersion();
  if (buildV == null) {
    // can not tell if versions match
    return null;
  }
  const v = version();
  if (v == "") {
    // can not tell if versions match
    return null;
  }
  return buildV == v;
};

const printBanner = () => {
  try {
    const banner = bannerTemplate.replace(/#+/g, (characters) =>
      displayVersion().padStart(characters.length, " ")
    );
    console.log(banner);
    if (checkVersion() === false) {
      console.warn(
        `Warning: Running a different version of the queue (${buildVersion()} instead of ${version()})`
      );
      console.warn("(Use `npm run build` to build the current version)\n");
    }
  } catch (e) {
    // ignore error
  }
};

export { printBanner };
