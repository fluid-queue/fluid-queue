[![Node.js CI](https://github.com/ToransuShoujo/quesoqueue_plus/actions/workflows/node.js.yml/badge.svg)](https://github.com/ToransuShoujo/quesoqueue_plus/actions/workflows/node.js.yml)

# Queso Queue Plus

A queue system for Mario Maker 2.




## How do I use this?

First, you must clone the project. Either download the source or run the following command:

```bash
  git clone https://github.com/ToransuShoujo/quesoqueue_plus
```

Next, install the dependencies for the project using the following command:

```bash
  npm install
```

After that, configure the settings.js file (detailed below). Finally, run the following command to start the bot:

```bash
  npm start run
```


## What does the settings.json contain?

The settings.json file contains several options to make the bot as customizable as possible.

`username` is the username of your bot account or your account.

`password` is the oauth token of the bot, including the portion that says 'oauth'. This can be generated at https://twitchapps.com/tmi/.

`channel` is the channel that the bot will run in. This should be your Twitch account username.

`start_open` is the toggle for whether or not the queue will start open. The default value is false.

`max_size` is the maximum amount of levels allowed in the queue at once. The default value is 100.

`level_timeout` is the amount of time in minutes a level can be played before the bot will inform you that time is up. The default value is 9999.

`level_selection` is an array that defines the order that levels will be selected in upon using `!level`. Once the order is completed, it will loop.

`message_cooldown` is the amount of time in seconds that a user must wait before !list will display the levels in the queue after a previous use. The default value is 5.

`dataIdCourseThreshold` is the highest allowed data ID for course IDs. This is used to stop levels that do not exist from entering the queue, however it is very difficult to know and/or dynamically change this amount accordingly. As such, the default value is undefined, which ignores the restriction.

`dataIdMakerThreshold` is the highest allowed data ID for maker IDs. This is used to stop maker IDs that do not exist from entering the queue, however it is very difficult to know and/or dynamically change this amount accordingly. As such, the default value is undefined, which ignores the restriction.






## What commands are there?

The following list contains all commands and aliases accessible to you while using the queue. All commands marked with an asterisk are only accessible to the channel owner.

It is important to note that all commands that draw a level (with exception to `!dismiss`) will first remove the currently selected level before drawing a new one.

`!open`* opens the queue and allows levels to be added.

`!close`* closes the queue and prevents levels from being added.

`!clear`* will remove all levels from the queue, including the current level.

`!restore`* will reload the queue if any changes were made to the cached queue file.

`!add` adds a level or maker ID to the queue, provided a level code or maker ID follows the command.

`!remove`/`!leave` will remove a user's submitted level or maker ID from the queue. If used by the channel owner, a name can be specified to remove another user's level or maker ID.

`!replace`/`!change`/`!swap` will swap a user's level code for the one following the command. Queue position is preserved when this is used.

`!brb` will mark the user as offline. Their levels cannot be selected while in this state.

`!back` will mark the user as online. Their levels can be selected while in this state.

`!current` will show the currently selected level or maker ID as well as who submitted it.

`!order` will show the level selection order as defined in the settings.js file. It also shows what the next level selection will be.

`!list`/`!queue` will show an in-order list of levels in the queue. It will display the current level as well as the next 5 levels of those currently online. It will also display how many people in the queue are offline.

`!position` will output the user's position in the queue, provided they have one.

`!level`* will select a level from the queue with respect to the order definined in the settings.js file.

`!next`* will select the next level from the queue.

`!random`* will select a random level from the queue.

`!weightedrandom`* will select a random level from the queue using the amount of time spent online and waiting in the queue as weight. 

`!subnext`* will select the next subscriber's level from the queue.

`!subrandom`* will select a random subscriber's level from the queue.

`!modnext`* will select the next moderator's level from the queue.

`!modrandom`* will select a random moderator's level from the queue.

`!dismiss`/`!skip`/`!complete`* will remove the current level from the queue without drawing a new one.

`!select`* will select a specific user's level, provided it is defined after the command.

`!punt`* will move the currently selected level to the back of the queue.








## Will you add [insert feature here]?

Possibly! If you have an idea for a change to the queue, feel free to post it to the issues board at https://github.com/ToransuShoujo/quesoqueue_plus/issues and we can look into getting it made. Better yet, if you just can't want and want to take a crack at it yourself, feel free to edit the code and submit a pull request. 
