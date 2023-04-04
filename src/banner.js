const bannerTemplate = ` ___  _          _      _                                       
|  _|| |        |_|    | | ###################################  
| |_ | |  _   _  _  ___| |     _____  _   _  ____  _   _  ____  
|  _|| | | | | || |/  _  | ___|  _  || | | ||  _ || | | ||  _ | 
| |  | |_| |_| || || |_| |/__/| |_| || |_| ||  __/| |_| ||  __/ 
|_|  |__/|_____/|_/|_____/    \\___  ||_____/|____||_____/|____| 
                                  | |                           
 ~ ><))°> o° .  ~ ><))°> ~   o°  .|_|  ~ ><))°>  °o ><))°> o( )°
`;

const version = () => {
  if (
    process != null &&
    process.env != null &&
    process.env.npm_package_version != null
  ) {
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
