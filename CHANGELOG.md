# [unreleased]

## Breaking changes

- The queue is now written in TypeScript and using ECMAScript modules.
  This requires a build step before running the queue: `npm run build`.
  Also make sure you have the dev dependencies installed before building the queue `NODE_ENV=development npm install`.
  You can also download a compiled version at <https://github.com/fluid-queue/fluid-queue/releases> or use the docker container to avoid building the sources.

# [2.0.0-beta.3]

## Bug fixes

- Fix a bug where the `!submitted` command was not working (#67)

# [2.0.0-beta.2]

## Bug fixes

- Fix race condition that leads to crash when using the `!chance` command (#63)

# [2.0.0-beta.1]

## Breaking changes

- Move `settings.json` to the `settings` directory and deprecate loading
  `settings.json` from the root. The deprecation warning means this isn't breaking
  yet, but **this will break eventually**.
- Minimum node version is 16.
- Settings `username` and `password` are removed and no longer supported.
  Instead `clientId` and `clientSecret` have to be supplied as well as a `settings/tokens.json` file is now required, containing the following properties:
  - `accessToken` - a twitch access token with the following scopes: `chat:edit`, `chat:read`, `moderator:read:chatters`
  - `refreshToken` - a twitch refresh token
  - `expiresIn` initially set to `0`
  - `obtainmentTimestamp` initially set to `0`
- The bot has to be the broadcaster or a moderator in your chat

## New features

- Custom level types (#1)
- Support for SMM1 level codes (#1)
- Level code resolvers (#1)

## Bug fixes

- Fix founders not being counted as subscribers (#25)

## Other changes

- Moved source files to a `src` subdirectory (#21)
- Reset lurker status more often (#22)
- Add support for command aliases (#24)
- Modify Dockerfile and docker-compose.yml to better support publishing on
  Docker Hub (#36)
- Allow for migration of customCodes.json from the data directory for migration
  from the old Docker container (demize/quesoqueue) (#36)
- Add banner in console log on application startup
