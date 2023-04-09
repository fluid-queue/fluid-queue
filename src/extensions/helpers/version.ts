export const getMajorVersion = (version: string): number => {
  version = version.trim();
  const index = version.indexOf(".");
  if (index == -1) {
    return parseInt(version);
  }
  return parseInt(version.substring(0, index));
};

export const checkVersion = (
  currentVersion: string,
  newVersion: string,
  [name]: string
): void => {
  if (currentVersion == null || newVersion == null) {
    throw new Error(
      `version missing in the save file` +
        (name == null ? "" : ` for extension ${name}`)
    );
  }
  const currentMajorVersion = getMajorVersion(currentVersion);
  const newMajorVersion = getMajorVersion(newVersion);
  if (newMajorVersion > currentMajorVersion) {
    throw new Error(
      `version ${newVersion} in the save file is not compatible with current version ${currentVersion}` +
        (name == null ? "" : ` for extension ${name}`)
    );
  }
  // version is compatible for now
};
