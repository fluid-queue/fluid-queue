# [unreleased]

## Breaking changes

- Move `settings/settings.json` to `settings/settings.yml` and deprecate loading
  `settings/settings.json`. The deprecation warning means this isn't breaking
  yet, but **this will break eventually**.
  The settings are now parsed as YAML instead of JSON.
- New queue save file version 3.0 that can not be read by previous versions of the queue.
  All old save file versions are converted automatically and require the twitch api.
  The location of the save file stays the same: `data/queue.json`.
  If there are users in your queue who renamed themselves or deleted their account then their level and waiting time will be removed from the queue.
  You can find those removed levels and waiting times in the file `data/lost-levels-YYYY-MM-DDThhmmssZ.json` where `YYYY-MM-DDThhmmssZ` will be replaced with the current time in UTC.
- The queue is now written in TypeScript and using ECMAScript modules.
  This requires a build step before running the queue: `npm run build`.
  Also make sure you have the dev dependencies installed before building the queue `NODE_ENV=development npm install`.
  You can also download a compiled version at <https://github.com/fluid-queue/fluid-queue/releases> or use the docker container to avoid building the sources.
- Subscriber status, moderator status and BRB status (by using the `!brb` command) is only stored for 12 hours per user after which the status is reset.
- The setting `smm1_codes_enabled` was removed and needs to be removed from `settings/settings.yml`. If you want to use SMM1 levels, make sure to configure `"smm1"` as one of the resolvers for the `"resolvers"` setting instead.
- The minimum node version is now `18.6.0` and the docker image is now build with node version `20`.
- `!clear` no longer clears all levels, instead you have to use `!clear all` to clear all levels; or instead set the `"clear"` setting in `settings/settings.yml` to `"all"` and then `!clear` clears all levels again.
- Subscribers and moderators are now monitored through eventsub and with a check when the stream comes online. This requires new token scopes, and a warning will be printed during startup (and this functionality disabled) if the scopes are missing.

## New features

- Usage of user ids instead of usernames for the queue save file as well as internal state of the queue.
  This means that if someone renames themselves that they will still keep their queue entry as well as their waiting time,
  and the queue will still use the previous display name until the queue automatically detects someones name has changed.
- Moderators and the broadcaster can now use the moderator `!entry <username>` command to show the queue entry of someone else.
- The bot now uses `i18next` for internationalization, and supports arbitrary locales (in the formats `en`, `eng`, `en-us`, and `eng-usa`; two or three letters in each part, up to two parts) so long as a locale file is present. Only the `en` locale is supported currently.
- The bot now optionally prints a message when a user whose level is next is offline.
- Levels of deleted users can be cleared by using `!clear deleted`; this will also rename all users in the queue.
- Levels of users who were not online for a while can now be cleared with `!clear {duration}` where duration can be multiple numbers followed by a unit (`min`, `hours`, `months`, etc. for a full list see [the documentation of timestring](https://github.com/mike182uk/timestring/tree/7.0.0#keywords)). For example `!clear 6 months 12 hours` clears all levels from everywhone who was not last online 6 months and 12 hours ago.
- Console messages printed by the bot are now timestamped, and errors and warnings printed in color with `chalk`.

## New settings

- There is a new setting `clear` which can be set to the default argument of `!clear`. For example setting `clear` to `"all"` will make it so `!clear` will call `!clear all` or setting it to `6 months` would call `!clear 6 months` by default. Setting this to `null` (or not setting the value) will result into a usage message of the `!clear` command when using `!clear`.

## Bug fixes

- You no longer get the message `your level has been removed from the queue` when you use `!leave` and do not have a level in the queue.
- Random chance weight is only increased whenever the stream is online.

## Other changes

- The broadcaster can now use `!leave` and `!remove` without an argument to remove their own levels.

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
