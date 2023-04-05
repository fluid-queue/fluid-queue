[![Node.js CI](https://github.com/fluid-queue/fluid-queue/actions/workflows/node.js.yml/badge.svg)](https://github.com/fluid-queue/fluid-queue/actions/workflows/node.js.yml)

# fluid-queue

A queue system for Super Mario Maker 2 levels.

This project is based on Queso Queue Plus, which was originally developed by Shoujo (<https://github.com/ToransuShoujo/quesoqueue_plus/>) and diceguyd30 (<https://github.com/diceguyd30/queso_to_go_template>).

## How do I use this?

### Setting up token

To use the queue, you need an access and refresh token from twitch.
The following steps are needed:

1. Setup an application for your streamer user account on twitch if you do not have one already
   and make sure to set the redirect URL to `http://localhost:3000`:
   https://dev.twitch.tv/docs/authentication/register-app/
2. Install the twitch-cli: https://dev.twitch.tv/docs/cli/
3. Use the token command of the twitch-cli to create the token
   The bot requires the following permissions:

   - `chat:read` to be able to read your chat
   - `chat:edit` to be able to send chat messages
   - `moderator:read:chatters` to be able to check who is connected to chat

   You can use this command to generate the [token](https://dev.twitch.tv/docs/cli/token-command/#user-access-token):
   `twitch token -u -s "chat:read chat:edit moderator:read:chatters"`

   The cli will ask you about your client id and client secret that can be found by managing your application created in step 1.
   The cli will open a web page where you can login either with your bot account or with your streamer account depending if you want to run the bot with your streamer account or bot account.
   In case you are using your bot account please make sure that the bot account is a moderator in your chat as this is required for checking which people in the queue are connected to chat.

   After you finish the process there will be an `User Access Token` and a `Refresh Token` in the output of the cli.

4. Now download the [sample `tokens.json` file](#TODO) into your `settings` directory, rename it to `tokens.json`, and edit it like this:

   - Replace `{INITIAL_ACCESS_TOKEN}` with the `User Access Token` from the cli output
   - Replace `{INITIAL_REFRESH_TOKEN}` with the `Refresh Token` from the cli output

   Make sure to not copy any spaces and to replace the curly brackets.
   The expiry values should be left as `0`. See <https://twurple.js.org/docs/auth/providers/refreshing.html> for more details.

5. Do not forget to set both `clientId` and `clientSecret` in `settings/settings.json` in a later step of the instructions!

### Docker instructions

You need to have the Docker Engine installed on the system, as well as Docker Compose, for this to work.

First, download the [sample Compose file](https://raw.githubusercontent.com/fluid-queue/fluid-queue/main/docker-compose.sample.yml) and rename it to `docker-compose.yml`. Place it in the directory you want to use for the bot. Next, create a `data` and `settings` directory to store the bot's data and configuration in, and replace the volume paths in `docker-compose.yml` with your local paths.

Next, download the [sample `settings.json` file](https://raw.githubusercontent.com/fluid-queue/fluid-queue/main/settings/settings.example.json) into your `settings` directory, rename it to `settings.json`, and edit it appropriately (as described below). Do not forget to set your `clientId` and `clientSecret`.

Once you have your `settings.json` edited and inside your `settings` directory, your (empty, for now) `data` directory, and your `docker-compose.yml` pointing to the correct paths, you can run the bot. From the directory with `docker-compose.yml`:

```bash
  docker compose up
```

This will start the bot in "attached" mode, so you can see all the output. Assuming everything worked and the bot is connected to IRC, press `CTRL+C` to kill the bot. You can now start it in "detached" mode so it will keep running in the background:

```bash
  docker compose up -d
```

From here, if you want to stop the bot, you can simply run the following command from the same directory:

```bash
  docker compose stop
```

Unless you stop the bot manually with that command, the container will continue running, restarting automatically even through a reboot. The queue will be persisted on your local host in the data folder - `data/queue.json` - custom codes are persisted too - `data/extensions/customcode.json`.

To update the image, first bring down the container with the `-v` option (to remove ephemeral volumes):

```bash
  docker compose down -v
```

Then you can pull the updated container:

```bash
  docker compose pull
```

And now you can run the container again.

### Run NodeJs locally

First, you must clone the project. Either download the source or run the following command:

```bash
  git clone https://github.com/fluid-queue/fluid-queue.git
```

Next, install the dependencies for the project using the following command:

```bash
  NODE_ENV=production npm install
```

After that, copy (detailed below) and configure the `settings.json` file with your favorite text editor. Do not forget to set your `clientId` and `clientSecret`.

```bash
cp settings/settings.example.json settings/settings.json

# now edit settings.json with your favorite text editor
```

Finally, run the following command to start the bot:

```bash
  npm run start
```

To close the queue press `CTRL + C` inside the terminal.

The command `npm run start` is the only command you will need to the next time you want to start the bot.

## What does the settings.json contain?

The settings.json file contains several options to make the bot as customizable as possible.

`channel` is the channel that the bot will run in. This should be your Twitch account username, only containing underscores and lowercase alphanumeric characters.

`clientId` the client ID of your application. This needs to be set! See [setting up token](#setting-up-token) for details.

`clientSecret` the client secret of your application. This needs to be set! See [setting up token](#setting-up-token) for details.

`start_open` is the toggle for whether or not the queue will start open. The default value is `false`.

`enable_absolute_position` is the toggle for whether or not absolute position (offline position) is displayed along relative position (online position). The default value is `false`.

`custom_codes_enabled` is the toggle for whether or not custom codes are allowed to be added to the queue. When enabled, users are able to add an alias to the queue as opposed to the real ID. An example of this is `!add Kamek`. Before usage, the broadcaster must add custom codes to be used. This is detailed in the commands section.

`romhacks_enabled` is a toggle for whether or not romhacks are allowed to be added to the queue. When enabled, users may type `!add ROMhack` to add a ROMhack to the queue. This does not send the patch, but rather gives the user a convienent way to enter the queue without a real level code. The following case insensitive aliases are setup by default: `ROMhack`, `R0M-HAK-LVL`, `rom hack`.
See [how to remove custom level types](#removing-custom-level-types) for additional details.

`uncleared_enabled` is a toggle for whether or not uncleared levels are allowed to be added to the queue. When enabled, users may type `!add Uncleared` to add an uncleared level to the queue. This is a convienent way to put an uncleared level to the queue without a real level code, so the streamer would then need to pick an uncleared level for themselves when the level shows up. The following case insensitive aliases are setup by default: `Uncleared`, `UNC-LEA-RED`, `an uncleared level`, `uncleared level`.
See [how to remove custom level types](#removing-custom-level-types) for additional details.

`max_size` is the maximum amount of levels allowed in the queue at once. The default value is `100`.

`level_timeout` is the amount of time in minutes a level can be played before the bot will inform you that time is up. The default value of `null` means that the timer is deactivated.

`level_selection` is an array that defines the order that levels will be selected in upon using `!level`. Once the order is completed, it will loop.
Possible values are: `"next"`, `"subnext"`, `"modnext"`, `"random"`, `"weightedrandom"`, `"weightednext"`, `"subrandom"`, `"modrandom"`, `"weightedsubrandom"`, and `"weightedsubnext"`

`message_cooldown` is the amount of time in seconds that a user must wait before !list will display the levels in the queue after a previous use.

`dataIdCourseThreshold` is the highest allowed data ID for course IDs. This is used to stop levels that do not exist from entering the queue, however it is very difficult to know and/or dynamically change this amount accordingly. As such, the default value is `null`, which ignores the restriction.

`dataIdMakerThreshold` is the highest allowed data ID for maker IDs. This is used to stop maker IDs that do not exist from entering the queue, however it is very difficult to know and/or dynamically change this amount accordingly. As such, the default value is `null`, which ignores the restriction.

`prettySaveFiles` if set to true the files in the `./data/` and `./settings` directory are going to be formatted with spaces and new lines. The default value is `false` to reduce file size.

`subscriberWeightMultiplier` is the number added as a wait time for subscribers. The default value is `1.0`. Setting this to `1.2` for example will give subscribers an advantage for weighted random, because they would get 6 minutes of wait time per 5 minutes of waiting. This can be set to anything greater than or equal to `1.0`.

`list` is the order of the `!list`/`!queue` command. The following values are possible:

- `"position"` - the list will be sorted by time added. (`!next`)
- `"weight"` - the list will be sorted by weighted chance (watch time, `!weightednext`).
- `"both"` - the list will be sent twice, once sorted by time added and once sorted by weighted chance (watch time).
- `"none"` - the `!list`/`!queue` commands will be disabled.
- `null` - the setting is automatically determined by what is configured in `level_selection`.

`position` is which position the `!position` command shows. The following values are possible:

- `"position"` - the position of `!next`.
- `"weight"` - the position of `!weightednext`.
- `"both"` - both the position of `!next` and `!weightednext`.
- `"none"` - the `!position` command will be disabled.
- `null` - the setting is automatically determined by what is configured in `level_selection`.

`showMakerCode` if set to true it will display `(maker code)` next to level codes in chat if the code is a maker code. The default value is `true`.

## What commands are there?

The following list contains all commands and aliases accessible by default to you while using the queue. All commands marked with an asterisk are only accessible to the channel owner.

It is important to note that all commands that draw a level (with exception to `!dismiss`) will first remove the currently selected level before drawing a new one.

`!open`\* opens the queue and allows levels to be added.

`!close`\* closes the queue and prevents levels from being added.

`!clear`\* will remove all levels from the queue, including the current level.

`!add` adds a level or maker ID to the queue, provided a level code or maker ID follows the command.

`!remove`/`!leave` will remove a user's submitted level or maker ID from the queue. If used by the channel owner, a name can be specified to remove another user's level or maker ID.

`!replace`/`!change`/`!swap` will swap a user's level code for the one following the command. Queue position is preserved when this is used.

`!brb` will mark the user as offline. Their levels cannot be selected while in this state.

`!back` will mark the user as online. Their levels can be selected while in this state.

`!current` will show the currently selected level or maker ID as well as who submitted it.

`!order` will show the level selection order as defined in the settings.js file. It also shows what the next level selection will be.

`!list`/`!queue` will show an in-order list of levels in the queue. It will display the current level as well as the next 5 levels of those currently online. It will also display how many people in the queue are offline.

`!position` will output the user's position in the queue, provided they have one.

`!submitted`/`!entry`/`!mylevel`/`!mylvl` will output the user's submitted level code, provided they have submitted a level.

`!weightedchance`/`!odds`/`!chance`/`!chances` will output the user's chances of getting selected in weighted random.

`!level`\* will select a level from the queue with respect to the order defined in the settings.js file.

`!next`\* will select the next level from the queue.

`!random`\* will select a random level from the queue.

`!weightedrandom`\* will select a random level from the queue using the amount of time spent online and waiting in the queue as weight.

`!weightednext`\* will select the level from the queue with the most amount of time spent online and waiting in the queue. If multiple users have the same maximum time spent then the level nearer to the top will be chosen.

`!subnext`\* will select the next subscriber's level from the queue.

`!subrandom`\* will select a random subscriber's level from the queue.

`!weightedsubrandom`\* will select a random level from the subscribers using the amount of time spent online and waiting in the queue as weight.

`!weightedsubnext`\* will select the level from the queue with the most amount of time spent online and waiting in the queue and being subscribed. If multiple users have the same maximum time spent then the level nearer to the top will be chosen.

`!modnext`\* will select the next moderator's level from the queue.

`!modrandom`\* will select a random moderator's level from the queue.

`!dismiss`/`!skip`/`!complete`/`!completed`\* will remove the current level from the queue without drawing a new one.

`!select`\* will select a specific user's level, provided it is defined after the command.

`!punt`\* will move the currently selected level to the back of the queue.

`!customcodes` will display all of the custom codes that are set, provided the feature is enabled. If this is used by the broadcaster, it can also be used to add and remove custom codes. The appropriate syntax for this is `!customcode {add/remove/load} {customCode} {ID}` where `add`/`remove`/`load` is the desired operation, customCode is the custom code that the user would like to type (example being `!add Kamek`), and ID being the ID that the custom code is an alias of. If a code is being removed, the ID is not required. Please note that while adding or removing the custom codes from the _queue_ are not case sensitive, they are case sensitive with this command.
`!customcode load` will reload the custom codes from the `./customCodes.json` file, so you can manually edit that file and then reload the codes without having to restart the queue.

`!customlevels` will display all of the custom levels including their custom codes.

`!persistence` \* will give control over how and if the queue data is loaded/saved:

- `!persistence save` will manually save the queue state (current level, queue, wait time) to `./data/queue.json`.
- `!persistence on` will set the queue to automatically save its state whenever changes occur. (this is the default behaviour)
- `!persistence off` will deactivate any changes to be saved.
- `!persistence load` will manually load the queue state (current level, queue, wait time) from `./data/queue.json`. Please use this with caution since reloading the state can result in lost data and it is recommended to:
  - use `!persistence off` to prevent the queue from overriding changes you are going to make
  - make changes to `./data/queue.json`
  - use `!persistence load` to load these changes
  - use `!persistence on` to reactivate automatic saves

### Custom Level Types

Custom level types are levels that have no level code associated.

For example one might play uncleared levels from time to time and while doing viewer levels a viewer might want to submit an uncleared level (`!add uncleared`), but does not want to add a specific uncleared level to the queue. When the level gets picked, there will be no code and the streamer only sees that an uncleared level was picked and then the streamer may pick an uncleared level on their own.

Some more examples would be to be able to submit a maker team level (like team shell, team jamp or team precision) without submitting a specific level code, or to be able to submit a no skip super expert run etc. This could also be used to submit maker 1 levels or could be used for other games in general by just having a custom level type for that game and when people get picked they could join that game for example etc.

#### Setting up custom level types

There are some build-in custom level types:

- **Uncleared levels**

  To enable uncleared levels make sure to set `uncleared_enabled` to `true` in `settings.json`.
  To add uncleared levels use:
  `!add Uncleared`, or any of the alternatives: `!add UNC-LEA-RED`, `!add an uncleared level`, `!add uncleared level`

- **ROMhacks**

  To enable ROMhacks make sure to set `romhacks_enabled` to `true` in `settings.json`.
  To add ROMhacks use:
  `!add ROMhack`, or any of the alternatives: `!add R0M-HAK-LVL`, `!add rom hack`

You can also add your own custom levels:

`!customlevel add {customCode} {levelName...}`

where `customCode` will be a custom code how you will add this custom level with `!add {customCode}` and `levelName...` can be multiple words to describe the custom level.

For example the level name of an uncleared level is `an uncleared level`.
The level name will appear in sentences like these:

- `Currently playing {levelName...} submitted by {user}.`
- `{user}, you have submitted {levelName...} to the queue.`
- `{user}, {levelName...} has been added to the queue.`
- `{user}, your level in the queue has been replaced with {levelName...}.`

For example you could use this command to be able to add team shell levels to the queue: `!customlevel add teamshell a team shell level`
and when someone uses `!add teamshell` then the bot will respond with `[...], a team shell level has been added to the queue.`.

#### Removing custom level types

To remove ROMhacks you would need to set `romhacks_enabled` to `false` and to remove uncleared levels you would need to set `uncleared_enabled` to `false`.

The custom level type is added/removed automatically from the custom level types list in `./data/queue.json` depending on the configuration. If the configuration is set to `false`, but there are still levels in the queue, then they will still show up and are still saved to the json file, however no new levels can be added to the queue. Whenever all levels are removed from the queue (e.g. by them getting picked or by using `!clear` to remove all levels from the queue) and the configuration is set to `false` then the custom level type is removed from the save file.

To remove other custom levels use the following command:

`!customlevel remove {customCode}`

E.g. `!cusomlevel remove teamshell`

To disable custom levels instead use:

`!customlevel disable {customCode}`

Disabling custom levels will make them not submittable, but levels that are still present in the queue will still be displayed correctly.

To enable custom levels again use:

`!customlevel enable {customCode}`

You can add more codes to a custom level with:

`!customlevel code add {newCode} {customCode}`

And also remove codes with:

`!customlevel code remove {customCode}`

#### Importing/Exporting custom level types

To make sharing and installing custom level types easier the queue has an import and export function.

`!customlevel export {customCode}`

`!customlevel import {json}`

For example:

```
!customlevel add teamshell a team shell level
Created custom level "a team shell level" with code teamshell.
!customlevel code add TS teamshell
Added the code TS to the custom level with the name "a team shell level" and codes teamshell, TS.
!customlevel export TS
["d762ea56-cb01-4215-9e9c-1c4e7626da3f","a team shell level","teamshell","TS"]
```

Now someone else can just import that custom level:

```
!customlevel import ["d762ea56-cb01-4215-9e9c-1c4e7626da3f","a team shell level","teamshell","TS"]
Created custom level "a team shell level" with codes teamshell, TS.
```

### Aliases

The following list of commands are available to manage aliases:

`!aliases` will display the available aliases management commands and the available commands you can put aliases for.

- `!addalias command alias` adds the alias `alias` for command `command`
- `!removealias command alias` removes the alias `alias` for command `command`
- `!enablecmd command` enables the command `command`
- `!disablecmd command` disables the command `command` entirely.
- `!resetcmd command` resets the command `command` to default values.

The aliases are saved in a file in `./settings/aliases.json`. Please use this with caution. It might render the bot inoperable.

## Testing

To run tests: `npm test`.

If the following error occurs `TypeError: Converting circular structure to JSON` run `npm test -- --detectOpenHandles`.

To run tests without log output: `npm test -- --silent`.

To run a single test: `npm test -- -t custom-levels-v2.1-to-v2.2`.

## Will you add [insert feature here]?

Possibly! If you have an idea for a change to the queue, feel free to post it to the issues board at https://github.com/fluid-queue/fluid-queue/issues and we can look into getting it made. Better yet, if you just can't want and want to take a crack at it yourself, feel free to edit the code and submit a pull request.
