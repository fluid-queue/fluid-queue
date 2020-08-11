# Weighted Random

This is a fork of https://github.com/diceguyd30/queso_to_go_template.

This branch adds the possibility for weighted randoms.

### New commands:

`!chance` - Shows you the chance of winning random. 

### How to setup the ticket reward:

* Add a reward to your channel where `Require Viewer to Enter Text` is enabled.
* Start this version of queuso queue (do not forget to edit `settings.js`).
* Now redeem the custom reward yourself and type `!setup`.
* The bot should respond with `Custom reward is set up!`.
* When you close queuso queue the custom reward id is saved in the `rewards.save` file.

### How does it work?

When selecting a random level normally the chance of winning is `1/n`, where `n` is the number of submitted levels.
With the modifications each entry in the queue has a number of tickets associated and by default this number is 1.
Whenever a viewer redeems the custom channel point reward they get another ticket. That is like having a second queue entry.
This channel point reward can be used multiple times. There is no limit on the number of tickets associated with a queue entry.
The chance of winning is the amount of tickets your queue entry has divided by the total amount of tickets.

# Original README


These are the steps necessary to make sure your bot is authorized to perform the
actions it needs to.  Each step will assist in filling out one of the variables
located in `settings.js`.

PRIVACY WARNING
The code on this site is public by default. When you make changes to this
template you will get your own url. If someone figures out what your url is, 
they will be able to find your OAuth password. This is not a good thing.
Personally I would recommend using another code host like AWS Cloud 9, but
that is more difficult to set up. If you continue to use this, make sure
you DO NOT share the url.


Step 1: Create the Bot's Twitch Account (optional*)

Go through the standard steps of creating a new Twitch account.
This process should get you the username.  

* (If you would rather have the bot act as you, you can skip 
this step and use your own username)


Step 2: Get the Twitch Chat OAuth Password

There are more proper ways to do this, but they are too complex.  Let's
just use this workaround.  Make sure you are logged into the bot's account for
this step (or your own account if you want the bot to pretend to be you).

url: https://twitchapps.com/tmi/
This will get you the value for the password you'll need to access chat. Copy
everything, including the 'oath:' part.


Step 3: Fill out the rest

The channel name is the channel you want to run this bot on.
