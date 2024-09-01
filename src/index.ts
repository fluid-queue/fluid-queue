(await import("./banner.js")).printBanner();
(await import("./persistence.js")).setup();
import { quesoqueue as queue } from "./queue.js";
import { twitch } from "./twitch.js";
import { timer, Timer } from "./timer.js";
import * as aliasManagement from "./aliases.js";
import { twitchApi } from "./twitch-api.js";
import settings from "./settings.js";
import { helper } from "./chatbot.js";
import { QueueEntry, QueueSubmitter } from "./extensions-api/queue-entry.js";
import { Chatter, Responder } from "./extensions-api/command.js";
await import("./i18n.js");
import i18next from "i18next";
import { log } from "./chalk-print.js";

import { channelPointManager } from "./channel-points.js";
import { Duration } from "@js-joda/core";
import humanizeDuration from "humanize-duration";

const quesoqueue = queue();
const aliases = aliasManagement.aliases();
aliases.loadAliases();

let queue_open = settings.start_open;
let selection_iter = 0;
let level_timer: Timer | null = null;

if (settings.level_timeout) {
  level_timer = timer(() => {
    chatbot_helper.say(
      i18next.t("timerExpired", { channel: settings.channel })
    );
  }, settings.level_timeout);
}

function get_remainder(x: string) {
  const index = x.indexOf(" ");
  if (index == -1) {
    return "";
  }
  return x.substring(index + 1).trim();
}

let can_list = true;

function next_level_message(
  level: (QueueEntry & { online: boolean }) | undefined
) {
  if (level === undefined) {
    return i18next.t("queueEmptyNext");
  }
  twitch.notLurkingAnymore(level.submitter); // If we pull up a level, we should reset the lurking status
  const offline = (() => {
    if (settings.offline_message && !level.online) {
      return "$t(userOffline)";
    } else {
      return "";
    }
  })();
  return i18next.t("nowPlayingBasic", { level, offline });
}

function weightedrandom_level_message(
  level:
    | (QueueEntry & { selectionChance: string; online: boolean })
    | undefined,
  percentSuffix = ""
) {
  if (level === undefined) {
    return i18next.t("queueEmptyNext");
  }
  twitch.notLurkingAnymore(level.submitter); // If we pull up a level, we should reset the lurking status
  const offline = (() => {
    if (settings.offline_message && !level.online) {
      return "$t(userOffline)";
    } else {
      return "";
    }
  })();
  return i18next.t("nowPlayingWeightedRandom", {
    level,
    percentSuffix,
    offline,
  });
}

function weightednext_level_message(
  level:
    | (QueueEntry & { selectionChance: string; online: boolean })
    | undefined,
  percentSuffix = ""
) {
  if (level === undefined) {
    return i18next.t("queueEmptyNext");
  }
  twitch.notLurkingAnymore(level.submitter); // If we pull up a level, we should reset the lurking status
  const offline = (() => {
    if (settings.offline_message && !level.online) {
      return "$t(userOffline)";
    } else {
      return "";
    }
  })();
  return i18next.t("nowPlayingWeightedNext", { level, percentSuffix, offline });
}

function current_level_message({
  level,
  levelTime,
}: {
  level: QueueEntry | undefined;
  levelTime: Duration;
}) {
  if (level === undefined) {
    return i18next.t("noCurrent");
  }
  return i18next.t("currentLevel", {
    level,
    time: humanizeDuration(levelTime.toMillis(), {
      language: settings.language,
      fallbacks: ["en"],
      maxDecimalPoints: 0,
    }),
  });
}

const hasPosition = () => {
  return (
    settings.position == "both" ||
    settings.position == "position" ||
    (settings.position == null &&
      (settings.level_selection.includes("next") ||
        !settings.level_selection.includes("weightednext")))
  );
};

const hasWeightedPosition = () => {
  return (
    settings.position == "both" ||
    settings.position == "weight" ||
    (settings.position == null &&
      settings.level_selection.includes("weightednext"))
  );
};

const hasPositionList = () => {
  return (
    settings.list == "both" ||
    settings.list == "position" ||
    (settings.list == null &&
      (settings.level_selection.includes("next") ||
        !settings.level_selection.includes("weightednext")))
  );
};

const hasWeightList = () => {
  return (
    settings.list == "both" ||
    settings.list == "weight" ||
    (settings.list == null && settings.level_selection.includes("weightednext"))
  );
};

const position_message = async (
  position: number,
  weightedPosition: number,
  sender: Chatter
) => {
  if (position == -1) {
    return i18next.t("submitterNotFound", { submitter: sender });
  } else if (position === 0) {
    return i18next.t("positionCurrent");
  } else if (position === -3) {
    // show only weighted position!
    if (weightedPosition == -1) {
      return i18next.t("submitterNotFound", { submitter: sender });
    } else if (weightedPosition === 0) {
      return i18next.t("positionCurrent");
    } else if (weightedPosition == -2) {
      return i18next.t("positionWeightedBRB", { sender });
    } else if (weightedPosition == -3) {
      // none
      return "";
    }
    return i18next.t("weightedPosition", { sender, weightedPosition });
  }
  if (settings.enable_absolute_position) {
    const absPosition = await quesoqueue.absolutePosition(sender);
    if (weightedPosition > 0) {
      return i18next.t("absolutePosition", {
        sender,
        position,
        absPosition,
        weightedPosition,
      });
    } else {
      return i18next.t("absolutePositionNoWeighted", {
        sender,
        position,
        absPosition,
      });
    }
  } else {
    if (weightedPosition > 0) {
      return i18next.t("positionAndWeighted", {
        sender,
        position,
        weightedPosition,
      });
    } else {
      return i18next.t("senderPosition", { sender, position });
    }
  }
};

const weightedchance_message = (
  chance: string | number,
  multiplier: number,
  sender: Chatter
) => {
  if (chance == -1) {
    return i18next.t("submitterNotFound", { submitter: sender });
  } else if (chance == -2) {
    return i18next.t("oddsBRB", { sender });
  } else if (chance === 0) {
    return i18next.t("positionCurrent");
  }

  if (multiplier > 1.0) {
    return i18next.t("senderOddsMultiplier", {
      sender,
      chance,
      multiplier,
      maximumFractionDigits: 1,
      minimumFractionDigits: 1,
    });
  } else {
    return i18next.t("senderOdds", { sender, chance });
  }
};

const submitted_message = (level: QueueEntry | number, sender: Chatter) => {
  if (level === 0) {
    return i18next.t("positionCurrent");
  } else if (typeof level === "number") {
    return i18next.t("submitterNotFound", { submitter: sender });
  }
  return i18next.t("senderSubmitted", { sender, level });
};

const submitted_mod_message = (
  submitted:
    | { result: "no-submitter" | "not-found" }
    | { result: "current" | "level"; level: QueueEntry },
  usernameArgument: string
) => {
  if (submitted.result == "current") {
    return i18next.t("modSubmittedCurrent", { submitted });
  } else if (submitted.result == "not-found") {
    return i18next.t("modSubmittedNotFound", { usernameArgument });
  } else if (submitted.result == "level") {
    return i18next.t("modSubmittedEntry", { submitted });
  }

  return i18next.t("modSubmittedNoArgument");
};

async function pickLevel(
  selection_mode: string,
  respond: Responder,
  skip_user: QueueSubmitter | null | "none" | "not yet"
): Promise<
  | (QueueEntry & {
      online: boolean;
    })
  | undefined
> {
  let next_level;
  let dip_level;
  switch (selection_mode) {
    case "next":
      next_level = await quesoqueue.next();
      break;
    case "subnext":
      next_level = await quesoqueue.subnext();
      break;
    case "modnext":
      next_level = await quesoqueue.modnext();
      break;
    case "random":
      next_level = await quesoqueue.random();
      break;
    case "subrandom":
      next_level = await quesoqueue.subrandom();
      break;
    case "modrandom":
      next_level = await quesoqueue.modrandom();
      break;
    case "weightedrandom":
      next_level = await quesoqueue.weightedrandom();
      respond(
        "(" + selection_mode + ") " + weightedrandom_level_message(next_level)
      );
      break;
    case "weightednext":
      next_level = await quesoqueue.weightednext();
      respond(
        "(" + selection_mode + ") " + weightednext_level_message(next_level)
      );
      break;
    case "weightedsubrandom":
      next_level = await quesoqueue.weightedsubrandom();
      respond(
        "(" +
          selection_mode +
          ") " +
          weightedrandom_level_message(next_level, " (subscriber)")
      );
      break;
    case "weightedsubnext":
      next_level = await quesoqueue.weightedsubnext();
      respond(
        "(" +
          selection_mode +
          ") " +
          weightednext_level_message(next_level, " (subscriber)")
      );
      break;
    case "skip":
      if (skip_user == null) {
        throw new Error(
          "Trying to skip the queue without specifying a skip user"
        );
      }
      if (skip_user == "none" || skip_user == "not yet") {
        throw new Error(
          "Trying to skip the queue but skip user is none/not yet"
        );
      }
      dip_level = quesoqueue.dip(skip_user.name);
      if (dip_level == undefined) {
        next_level = undefined;
        break;
      }
      next_level = { ...dip_level, online: true };
      break;
    default:
      selection_mode = "default";
      next_level = await quesoqueue.next();
  }
  return next_level;
}

// What the bot should do when someone sends a message in chat.
// `message` is the full text of the message. `sender` is the username
// of the person that sent the message.

async function HandleMessage(
  message: string,
  sender: Chatter,
  respond: Responder
) {
  twitch.noticeChatter(sender);

  const argsArray = message.split(" ");
  let cmd = argsArray.shift();
  cmd = cmd?.toLowerCase();
  const args = argsArray.join(" ");
  if (args.length == 0) {
    message = cmd ?? "";
  } else {
    message = (cmd ?? "") + " " + args;
  }

  if (message.toLowerCase().startsWith("!addalias") && sender.isBroadcaster) {
    if (message.split(" ").length !== 3) {
      respond(i18next.t("addAliasSyntax"));
    } else {
      const splitMessage = message.split(" ");
      if (
        aliases.addAlias(
          splitMessage[1].startsWith("!")
            ? splitMessage[1].toLowerCase().substring(1)
            : splitMessage[1].toLowerCase(),
          splitMessage[2]
        )
      ) {
        respond(
          i18next.t("addAliasAdded", {
            alias: splitMessage[2],
            command: splitMessage[1],
          })
        );
      } else {
        if (!aliases.isCommand(splitMessage[1].toLowerCase())) {
          const commands = aliases.getCommands();
          respond(
            i18next.t("commandInvalid", {
              commands,
              style: "short",
              type: "unit",
            })
          );
        } else if (aliases.isDisabled(splitMessage[1].toLowerCase())) {
          respond(
            i18next.t("aliasCommandDisabled", { command: splitMessage[1] })
          );
        } else {
          respond(i18next.t("addAliasDuplicate", { alias: splitMessage[2] }));
        }
      }
    }
  } else if (
    message.toLowerCase().startsWith("!removealias") &&
    sender.isBroadcaster
  ) {
    if (message.split(" ").length !== 3) {
      respond(i18next.t("removeAliasSyntax"));
    } else {
      const splitMessage = message.split(" ");
      if (
        aliases.removeAlias(
          splitMessage[1].startsWith("!")
            ? splitMessage[1].toLowerCase().substring(1)
            : splitMessage[1].toLowerCase(),
          splitMessage[2].startsWith("!")
            ? splitMessage[2]
            : "!" + splitMessage[2]
        )
      ) {
        respond(
          i18next.t("removeAliasRemoved", {
            alias: splitMessage[2],
            command: splitMessage[1],
          })
        );
      } else {
        if (!aliases.isCommand(splitMessage[1].toLowerCase())) {
          const commands = aliases.getCommands();
          respond(
            i18next.t("commandInvalid", {
              commands,
              style: "short",
              type: "unit",
            })
          );
        } else if (aliases.isDisabled(splitMessage[1].toLowerCase())) {
          respond(
            i18next.t("aliasCommandDisabled", { command: splitMessage[1] })
          );
        } else {
          respond(
            i18next.t("removeAliasNotFound", {
              alias: splitMessage[2],
              command: splitMessage[1],
            })
          );
        }
      }
    }
  } else if (
    (message.toLowerCase().startsWith("!enablecmd") ||
      message.toLowerCase().startsWith("!disablecmd") ||
      message.toLowerCase().startsWith("!resetcmd")) &&
    sender.isBroadcaster
  ) {
    if (message.split(" ").length !== 2) {
      respond(i18next.t("enableSyntax"));
    } else {
      const splitMessage = message.split(" ");
      if (splitMessage[0].toLowerCase() === "!enablecmd") {
        if (
          aliases.enableCommand(
            splitMessage[1].startsWith("!")
              ? splitMessage[1].toLowerCase().substring(1)
              : splitMessage[1].toLowerCase()
          )
        ) {
          // if the command starts with "!" - remove the "!".
          respond(i18next.t("commandEnabled", { command: splitMessage[1] }));
        } else {
          if (
            !aliases.isCommand(
              splitMessage[1].startsWith("!")
                ? splitMessage[1].toLowerCase().substring(1)
                : splitMessage[1].toLowerCase()
            )
          ) {
            const commands = aliases.getCommands();
            respond(
              i18next.t("commandInvalid", {
                commands,
                style: "short",
                type: "unit",
              })
            );
          } else {
            i18next.t("commandAlreadyEnabled", { command: splitMessage[1] });
          }
        }
      } else if (splitMessage[0].toLowerCase() === "!disablecmd") {
        if (
          aliases.disableCommand(
            splitMessage[1].startsWith("!")
              ? splitMessage[1].toLowerCase().substring(1)
              : splitMessage[1].toLowerCase()
          )
        ) {
          // if the command starts with "!" - remove the "!".
          respond(i18next.t("commandDisabled", { command: splitMessage[1] }));
        } else {
          if (
            !aliases.isCommand(
              splitMessage[1].startsWith("!")
                ? splitMessage[1].toLowerCase().substring(1)
                : splitMessage[1].toLowerCase()
            )
          ) {
            const commands = aliases.getCommands();
            respond(
              i18next.t("commandInvalid", {
                commands,
                style: "short",
                type: "unit",
              })
            );
          } else {
            respond(
              i18next.t("commandAlreadyDisabled", { command: splitMessage[1] })
            );
          }
        }
      } else if (splitMessage[0] === "!resetcmd") {
        if (
          aliases.resetCommand(
            splitMessage[1].startsWith("!")
              ? splitMessage[1].toLowerCase().substring(1)
              : splitMessage[1].toLowerCase()
          )
        ) {
          // if the command starts with "!" - remove the "!".
          respond(i18next.t("commandReset", { command: splitMessage[1] }));
        } else {
          if (
            !aliases.isCommand(
              splitMessage[1].startsWith("!")
                ? splitMessage[1].toLowerCase().substring(1)
                : splitMessage[1].toLowerCase()
            )
          ) {
            const commands = aliases.getCommands();
            respond(
              i18next.t("commandInvalid", {
                commands,
                style: "short",
                type: "unit",
              })
            );
          }
        }
      }
    }
  } else if (
    message.toLowerCase().startsWith("!aliases") &&
    sender.isBroadcaster
  ) {
    respond(i18next.t("aliasHelp"));
    const commands = aliases.getCommands();
    respond(
      i18next.t("aliasesList", { commands, style: "short", type: "unit" })
    );
  } else if (aliases.isAlias("open", message) && sender.isBroadcaster) {
    queue_open = true;
    respond(i18next.t("queueOpen"));
  } else if (aliases.isAlias("close", message) && sender.isBroadcaster) {
    queue_open = false;
    respond(i18next.t("queueClosed"));
  } else if (aliases.isAlias("add", message)) {
    if (queue_open || sender.isBroadcaster) {
      // If they just added their level, it's a safe bet they aren't lurking
      if (twitch.notLurkingAnymore(sender)) {
        // But to avoid confusion, we can welcome them back too
        respond(i18next.t("welcomeBack", { sender }));
      }
      const level_code = get_remainder(message);
      respond(quesoqueue.add(level_code, sender));
    } else {
      respond(i18next.t("queueClosedSorry"));
    }
  } else if (aliases.isAlias("remove", message)) {
    const to_remove = get_remainder(message);
    if (sender.isBroadcaster && to_remove != "") {
      respond(quesoqueue.modRemove(to_remove));
    } else {
      // if they're leaving, they're not lurking
      twitch.notLurkingAnymore(sender);
      respond(quesoqueue.remove(sender));
    }
  } else if (aliases.isAlias("replace", message)) {
    const level_code = get_remainder(message);
    // If they just added their level, it's a safe bet they aren't lurking
    if (twitch.notLurkingAnymore(sender)) {
      // But to avoid confusion, we can welcome them back too
      respond(i18next.t("welcomeBack", { sender }));
    }
    respond(quesoqueue.replace(sender, level_code));
  } else if (aliases.isAlias("level", message) && sender.isBroadcaster) {
    let next_level:
      | (QueueEntry & {
          online: boolean;
        })
      | undefined;
    let selection_mode;
    // Check for a queue skip
    let skip = await channelPointManager.getNextSubmitter();
    if ((skip as QueueSubmitter).name) {
      selection_mode = "skip";
    } else {
      selection_mode =
        settings.level_selection[
          selection_iter++ % settings.level_selection.length
        ];
      if (selection_iter >= settings.level_selection.length) {
        selection_iter = 0;
      }
    }
    if (selection_mode == undefined) {
      selection_mode = "default";
    }
    next_level = await pickLevel(selection_mode, respond, skip);
    if (skip == "not yet" && next_level == undefined) {
      skip = await channelPointManager.getNextSubmitter(true);
      next_level = await pickLevel(selection_mode, respond, skip);
    }
    if (settings.level_timeout && level_timer != null) {
      level_timer.restart();
      // Pause the timer if there's no next level, or the auto timer isn't set
      if (!next_level || !settings.auto_timer) {
        level_timer.pause();
      }
    }
    if (
      selection_mode != "weightedrandom" &&
      selection_mode != "weightednext" &&
      selection_mode != "weightedsubrandom" &&
      selection_mode != "weightedsubnext"
    ) {
      respond("(" + selection_mode + ") " + next_level_message(next_level));
    }
    // Make sure the level is removed from the skip queue if the user was offline and it was pulled anyway;
    // This will refund their points, but that's fair
    if (selection_mode != "skip" && next_level) {
      channelPointManager.removeFromSkipQueue(next_level.submitter);
    }
  } else if (aliases.isAlias("next", message) && sender.isBroadcaster) {
    const next_level = await quesoqueue.next();
    if (settings.level_timeout && level_timer != null) {
      level_timer.restart();
      // Pause the timer if there's no next level, or the auto timer isn't set
      if (!next_level || !settings.auto_timer) {
        level_timer.pause();
      }
    }
    respond(next_level_message(next_level));
    // Commands other than !level do not check the skip queue, points should be refunded if a level is pulled
    if (next_level) {
      channelPointManager.removeFromSkipQueue(next_level.submitter);
    }
  } else if (aliases.isAlias("subnext", message) && sender.isBroadcaster) {
    const next_level = await quesoqueue.subnext();
    if (settings.level_timeout && level_timer != null) {
      level_timer.restart();
      // Pause the timer if there's no next level, or the auto timer isn't set
      if (!next_level || !settings.auto_timer) {
        level_timer.pause();
      }
    }
    respond(next_level_message(next_level));
    // Commands other than !level do not check the skip queue, points should be refunded if a level is pulled
    if (next_level) {
      channelPointManager.removeFromSkipQueue(next_level.submitter);
    }
  } else if (aliases.isAlias("modnext", message) && sender.isBroadcaster) {
    const next_level = await quesoqueue.modnext();
    if (settings.level_timeout && level_timer != null) {
      level_timer.restart();
      // Pause the timer if there's no next level, or the auto timer isn't set
      if (!next_level || !settings.auto_timer) {
        level_timer.pause();
      }
    }
    respond(next_level_message(next_level));
    // Commands other than !level do not check the skip queue, points should be refunded if a level is pulled
    if (next_level) {
      channelPointManager.removeFromSkipQueue(next_level.submitter);
    }
  } else if (aliases.isAlias("random", message) && sender.isBroadcaster) {
    const next_level = await quesoqueue.random();
    if (settings.level_timeout && level_timer != null) {
      level_timer.restart();
      // Pause the timer if there's no next level, or the auto timer isn't set
      if (!next_level || !settings.auto_timer) {
        level_timer.pause();
      }
    }
    respond(next_level_message(next_level));
    // Commands other than !level do not check the skip queue, points should be refunded if a level is pulled
    if (next_level) {
      channelPointManager.removeFromSkipQueue(next_level.submitter);
    }
  } else if (aliases.isAlias("weightednext", message) && sender.isBroadcaster) {
    const next_level = await quesoqueue.weightednext();
    if (settings.level_timeout && level_timer != null) {
      level_timer.restart();
      // Pause the timer if there's no next level, or the auto timer isn't set
      if (!next_level || !settings.auto_timer) {
        level_timer.pause();
      }
    }
    respond(weightednext_level_message(next_level));
    // Commands other than !level do not check the skip queue, points should be refunded if a level is pulled
    if (next_level) {
      channelPointManager.removeFromSkipQueue(next_level.submitter);
    }
  } else if (
    aliases.isAlias("weightedrandom", message) &&
    sender.isBroadcaster
  ) {
    const next_level = await quesoqueue.weightedrandom();
    if (settings.level_timeout && level_timer != null) {
      level_timer.restart();
      // Pause the timer if there's no next level, or the auto timer isn't set
      if (!next_level || !settings.auto_timer) {
        level_timer.pause();
      }
    }
    respond(weightedrandom_level_message(next_level));
    // Commands other than !level do not check the skip queue, points should be refunded if a level is pulled
    if (next_level) {
      channelPointManager.removeFromSkipQueue(next_level.submitter);
    }
  } else if (
    aliases.isAlias("weightedsubnext", message) &&
    sender.isBroadcaster
  ) {
    const next_level = await quesoqueue.weightedsubnext();
    if (settings.level_timeout && level_timer != null) {
      level_timer.restart();
      // Pause the timer if there's no next level, or the auto timer isn't set
      if (!next_level || !settings.auto_timer) {
        level_timer.pause();
      }
    }
    respond(weightednext_level_message(next_level, " (subscriber)"));
    // Commands other than !level do not check the skip queue, points should be refunded if a level is pulled
    if (next_level) {
      channelPointManager.removeFromSkipQueue(next_level.submitter);
    }
  } else if (
    aliases.isAlias("weightedsubrandom", message) &&
    sender.isBroadcaster
  ) {
    const next_level = await quesoqueue.weightedsubrandom();
    if (settings.level_timeout && level_timer != null) {
      level_timer.restart();
      // Pause the timer if there's no next level, or the auto timer isn't set
      if (!next_level || !settings.auto_timer) {
        level_timer.pause();
      }
    }
    respond(weightedrandom_level_message(next_level, " (subscriber)"));
    // Commands other than !level do not check the skip queue, points should be refunded if a level is pulled
    if (next_level) {
      channelPointManager.removeFromSkipQueue(next_level.submitter);
    }
  } else if (aliases.isAlias("subrandom", message) && sender.isBroadcaster) {
    const next_level = await quesoqueue.subrandom();
    if (settings.level_timeout && level_timer != null) {
      level_timer.restart();
      // Pause the timer if there's no next level, or the auto timer isn't set
      if (!next_level || !settings.auto_timer) {
        level_timer.pause();
      }
    }
    respond(next_level_message(next_level));
    // Commands other than !level do not check the skip queue, points should be refunded if a level is pulled
    if (next_level) {
      channelPointManager.removeFromSkipQueue(next_level.submitter);
    }
  } else if (aliases.isAlias("modrandom", message) && sender.isBroadcaster) {
    const next_level = await quesoqueue.modrandom();
    if (settings.level_timeout && level_timer != null) {
      level_timer.restart();
      // Pause the timer if there's no next level, or the auto timer isn't set
      if (!next_level || !settings.auto_timer) {
        level_timer.pause();
      }
    }
    respond(next_level_message(next_level));
    // Commands other than !level do not check the skip queue, points should be refunded if a level is pulled
    if (next_level) {
      channelPointManager.removeFromSkipQueue(next_level.submitter);
    }
  } else if (aliases.isAlias("punt", message) && sender.isBroadcaster) {
    if (settings.level_timeout && level_timer != null) {
      level_timer.restart();
      // Always pause the timer
      level_timer.pause();
    }
    respond(await quesoqueue.punt());
  } else if (aliases.isAlias("dismiss", message) && sender.isBroadcaster) {
    if (settings.level_timeout && level_timer != null) {
      level_timer.restart();
      // Always pause the timer
      level_timer.pause();
    }
    respond(await quesoqueue.dismiss());
  } else if (aliases.isAlias("select", message) && sender.isBroadcaster) {
    const username = get_remainder(message);
    const dip_level = quesoqueue.dip(username);
    if (settings.level_timeout && level_timer != null) {
      level_timer.restart();
      // Pause the timer if there's no next level, or the auto timer isn't set
      if (!dip_level || !settings.auto_timer) {
        level_timer.pause();
      }
    }
    if (dip_level !== undefined) {
      twitch.notLurkingAnymore(dip_level.submitter);
      respond(i18next.t("nowPlayingBasic", { level: dip_level }));

      // Remove them from the skip queue, but fulfill the reward
      // If they were selected, they clearly skipped the queue
      channelPointManager.removeFromSkipQueue(dip_level.submitter, "FULFILLED");
    } else {
      respond(i18next.t("selectNoLevel", { username }));
    }
  } else if (aliases.isAlias("current", message)) {
    respond(current_level_message(quesoqueue.current()));
  } else if (aliases.isAlias("list", message)) {
    let do_list = false;
    const list_position = hasPositionList();
    const list_weight = hasWeightList();
    if (!list_position && !list_weight) {
      // do nothing
    } else if (settings.message_cooldown) {
      if (can_list) {
        can_list = false;
        setTimeout(() => (can_list = true), settings.message_cooldown);
        do_list = true;
      } else {
        respond(i18next.t("scrollUp"));
      }
    } else {
      do_list = true;
    }
    if (do_list) {
      if (list_position) {
        respond(await quesoqueue.level_list_message());
      }
      if (list_weight) {
        respond(await quesoqueue.level_weighted_list_message());
      }
    }
  } else if (aliases.isAlias("position", message)) {
    const list = await quesoqueue.list();
    respond(
      await position_message(
        hasPosition() ? await quesoqueue.position(sender, list) : -3,
        hasWeightedPosition()
          ? await quesoqueue.weightedPosition(sender, list)
          : -3,
        sender
      )
    );
  } else if (aliases.isAlias("weightedchance", message)) {
    respond(
      weightedchance_message(
        await quesoqueue.weightedchance(sender),
        quesoqueue.multiplier(sender),
        sender
      )
    );
  } else if (aliases.isAlias("submitted", message)) {
    const usernameArgument = get_remainder(message);
    if ((sender.isMod || sender.isBroadcaster) && usernameArgument != "") {
      respond(
        submitted_mod_message(
          quesoqueue.modSubmittedLevel(usernameArgument),
          usernameArgument
        )
      );
    } else {
      respond(
        submitted_message(await quesoqueue.submittedlevel(sender), sender)
      );
    }
  } else if (
    settings.level_timeout &&
    level_timer != null &&
    aliases.isAlias("start", message) &&
    sender.isBroadcaster
  ) {
    level_timer.resume();
    respond(i18next.t("timerStarted"));
  } else if (
    settings.level_timeout &&
    level_timer != null &&
    aliases.isAlias("resume", message) &&
    sender.isBroadcaster
  ) {
    level_timer.resume();
    respond(i18next.t("timerUnpaused"));
  } else if (
    settings.level_timeout &&
    level_timer != null &&
    aliases.isAlias("pause", message) &&
    sender.isBroadcaster
  ) {
    level_timer.pause();
    respond(i18next.t("timerPaused"));
  } else if (
    settings.level_timeout &&
    level_timer != null &&
    aliases.isAlias("restart", message) &&
    sender.isBroadcaster
  ) {
    level_timer.restart();
    respond(i18next.t("timerReset"));
  } else if (aliases.isAlias("persistence", message) && sender.isBroadcaster) {
    const subCommand = get_remainder(message);
    const response = await quesoqueue.persistenceManagement(subCommand);
    log(subCommand);
    log(response);
    respond(`@${sender.displayName} ${response}`);
  } else if (aliases.isAlias("clear", message) && sender.isBroadcaster) {
    const clearArgument = get_remainder(message);
    const response = await quesoqueue.clear(clearArgument, respond);
    if (response != null) {
      respond(response);
    }
  } else if (aliases.isAlias("brb", message)) {
    twitch.setToLurk(sender);
    respond(i18next.t("userLurk", { sender }));
  } else if (aliases.isAlias("back", message)) {
    if (twitch.notLurkingAnymore(sender)) {
      respond(i18next.t("welcomeBack", { sender }));
    }
  } else if (aliases.isAlias("order", message)) {
    if (settings.level_selection.length === 0) {
      respond(i18next.t("noOrder"));
    } else {
      const nextIndex = selection_iter % settings.level_selection.length;
      let order = [...settings.level_selection]; // copy array
      order = order.concat(order.splice(0, nextIndex)); // shift array to the left by nextIndex positions
      respond(
        i18next.t("orderList", {
          order,
          style: "short",
          type: "unit",
        })
      );
    }
  } else {
    return await quesoqueue.handleCommands(message, sender, respond);
  }
}

// Set up the chatbot helper
const chatbot_helper = helper(settings.channel);
chatbot_helper.setup(HandleMessage);

// run async code
// setup the twitch api
await twitchApi.setup();

// loading the queue
await quesoqueue.load();
twitchApi.registerStreamCallbacks(
  quesoqueue.onStreamOnline,
  quesoqueue.onStreamOffline
);

// setting up channel point rewards needs to happen after the queue is loaded
await channelPointManager.init(chatbot_helper.say.bind(chatbot_helper));

// connect to the Twitch channel.
await chatbot_helper.connect();
