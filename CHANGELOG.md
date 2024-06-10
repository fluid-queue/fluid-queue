# [Unreleased]

## New features

- Added an option (default off) to automatically start the level timer when pulling a level (#140).

## Other changes

- Add ids to submitted levels.
- Add the submission date of levels to the queue save file.

# v2.0.0-rc.1

## Breaking changes

- The minimum node version is now `20.9.0` and the docker image is now build with node version `20`. (#134)
- Move `settings/settings.json` to `settings/settings.yml` and deprecate loading
  `settings/settings.json`. The deprecation warning means this isn't breaking
  yet, but **this will break eventually**.
  The settings are now parsed as YAML instead of JSON. (#109)
- New queue save file version 3.0 that can not be read by previous versions of the queue.
  All old save file versions are converted automatically and require the twitch api.
  The location of the save file stays the same: `data/queue.json`.
  If there are users in your queue who renamed themselves or deleted their account then their level and waiting time will be removed from the queue.
  You can find those removed levels and waiting times in the file `data/lost-levels-YYYY-MM-DDThhmmssZ.json` where `YYYY-MM-DDThhmmssZ` will be replaced with the current time in UTC. (#68)
- The queue is now written in TypeScript and using ECMAScript modules.
  This requires a build step before running the queue: `npm run build`.
  Also make sure you have the dev dependencies installed before building the queue `NODE_ENV=development npm install`.
  You can also download a compiled version at <https://github.com/fluid-queue/fluid-queue/releases> or use the docker container to avoid building the sources. (#64, #70)
- Subscriber status, moderator status and BRB status (by using the `!brb` command) is only stored for 12 hours per user after which the status is reset. (#68)
- The setting `smm1_codes_enabled` was removed and needs to be removed from `settings/settings.yml`. If you want to use SMM1 levels, make sure to configure `"smm1"` as one of the resolvers for the `"resolvers"` setting instead. (#109)
- `!clear` no longer clears all levels, instead you have to use `!clear all` to clear all levels; or instead set the `"clear"` setting in `settings/settings.yml` to `"all"` and then `!clear` clears all levels again. (#101)
- Subscribers and moderators are now monitored through eventsub and with a check when the stream comes online. This requires new token scopes, and a warning will be printed during startup (and this functionality disabled) if the scopes are missing. (#107)
  - This is now implemented with a separate (optional) broadcaster token.
  - As a result of this, the bot no longer has to be mod, so long as a broadcaster token is provided with the `moderator:read:chatters` scope.

## New features

- Usage of user ids instead of usernames for the queue save file as well as internal state of the queue.
  This means that if someone renames themselves that they will still keep their queue entry as well as their waiting time,
  and the queue will still use the previous display name until the queue automatically detects someones name has changed. (#68)
- Moderators and the broadcaster can now use the moderator `!entry <username>` command to show the queue entry of someone else. (#80)
- The bot now uses `i18next` for internationalization, and supports arbitrary locales (in the formats `en`, `eng`, `en-us`, and `eng-usa`; two or three letters in each part, up to two parts) so long as a locale file is present. Only the `en` locale is supported currently. (#81)
- The bot now optionally prints a message when a user whose level is next is offline. (#98)
- Levels of deleted users can be cleared by using `!clear deleted`; this will also rename all users in the queue. (#101)
- Levels of users who were not online for a while can now be cleared with `!clear {duration}` where duration can be multiple numbers followed by a unit (`min`, `hours`, `months`, etc. for a full list see [the documentation of timestring](https://github.com/mike182uk/timestring/tree/7.0.0#keywords)). For example `!clear 6 months 12 hours` clears all levels from everywhone who was not last online 6 months and 12 hours ago. (#101)
- Console messages printed by the bot are now timestamped, and errors and warnings printed in color with `chalk`. (#107)
- A new system for channel point rewards has been added, allowing the bot to automatically manage your "skip queue"/"pway my wevel" redemptions. (#114)

## Settings

- The settings `level_timeout` and `message_cooldown` are now set using a duration which are multiple numbers followed by a unit (`min`, `hours`, `months`, etc. for a full list see [the documentation of timestring](https://github.com/mike182uk/timestring/tree/7.0.0#keywords)) or alternatively an [ISO-8601 duration format](https://js-joda.github.io/js-joda/class/packages/core/src/Duration.js~Duration.html#static-method-parse). (#125)
  For example: `10 seconds`, `3 minutes`, and `10 minutes 30 seconds` etc.  
  To convert the values `level_timeout` and `message_cooldown` to the new duration format add `minutes` to the number of `level_timeout` and `seconds` to the number of `message_cooldown`.
- There is a new setting `clear` which can be set to the default argument of `!clear`. For example setting `clear` to `"all"` will make it so `!clear` will call `!clear all` or setting it to `6 months` would call `!clear 6 months` by default. Setting this to `null` (or not setting the value) will result into a usage message of the `!clear` command when using `!clear`. (#101)

## Bug fixes

- You no longer get the message `your level has been removed from the queue` when you use `!leave` and do not have a level in the queue. (#80)
- Random chance weight is only increased whenever the stream is online. (#100)
- Lenient resolvers `smm2-lenient` and `ocw-lenient` are now actually lenient. (#113)

## Other changes

- The broadcaster can now use `!leave` and `!remove` without an argument to remove their own levels. (#80)

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
