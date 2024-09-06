// imports
import { jest } from "@jest/globals";
import readline from "readline";
import path from "path";
import fs from "fs";
import { SourceLocation } from "@babel/code-frame";
import {
  simRequireIndex,
  simSetChatters,
  buildChatter,
  clearAllTimers,
  START_TIME,
  EMPTY_CHATTERS,
  Simulation,
} from "../simulation.js";
import { fileURLToPath } from "url";
import { z } from "zod";
import _ from "lodash";
import { execSync } from "child_process";
import writeFileAtomic from "write-file-atomic";
import jsonOrder from "json-order";

const isPronoun = (text: string) => {
  return text == "Any" || text == "Other" || text.includes("/");
};

// fake timers
jest.useFakeTimers();

beforeEach(() => {
  // reset chatters
  simSetChatters(EMPTY_CHATTERS);

  // reset time
  jest.setSystemTime(START_TIME);
});

test("setup", async () => {
  await expect(simRequireIndex()).resolves.toBeTruthy();
});

const parseMessage = (line: string) => {
  const idx = line.indexOf(":");
  const user = line.substring(0, idx).trim();
  let message = line.substring(idx + 1);
  const sender = parseChatter(user);
  let column = message.length;
  message = message.trimStart();
  column -= message.length;
  let trimLen = message.length;
  message = message.trimEnd();
  trimLen -= message.length;
  return {
    message: message.trim(),
    sender,
    column: idx + 2 + column,
    trimLen: trimLen,
  };
};

const parseChatter = (chatter: string) => {
  let user = chatter.trim();
  let isBroadcaster = false;
  let isMod = false;
  let isSubscriber = false;
  let username;
  for (;;) {
    if (user.startsWith("~")) {
      isBroadcaster = true;
    } else if (user.startsWith("@")) {
      isMod = true;
    } else if (user.startsWith("%")) {
      isSubscriber = true;
    } else if (
      user.startsWith("+") ||
      user.startsWith("$") ||
      user.startsWith("^") ||
      user.startsWith("*") ||
      user.startsWith("!") ||
      user.startsWith("&") ||
      user.startsWith("'") ||
      user.startsWith("?")
    ) {
      // nothing to set
    } else {
      break;
    }
    user = user.substring(1);
  }
  // find username
  while (user.endsWith(")")) {
    const idx = user.lastIndexOf("(");
    const maybeUsername = user.substring(idx + 1, user.length - 1).trim();
    user = user.substring(0, idx).trim();
    if (!isPronoun(maybeUsername)) {
      // found username!
      username = maybeUsername;
    }
  }
  const displayName = user;
  if (username === undefined) {
    username = displayName.toLowerCase();
  }
  expect(username).toBeDefined();
  expect(displayName).toBeDefined();
  return buildChatter(
    username,
    displayName,
    isSubscriber,
    isMod,
    isBroadcaster
  );
};

type FixInstruction = {
  contents: string;
  json?: boolean | undefined;
  position: SourceLocation;
};

const chatLogTest = async (
  fileName: string,
  fixingTests: boolean
): Promise<FixInstruction[]> => {
  const simulation = await Simulation.load();
  let chatbot: string | null = null;
  const fixInstructions: FixInstruction[] = [];

  try {
    const fileContents = fs.readFileSync(fileName, { encoding: "utf-8" });
    await simulation.withMeta(
      {
        fileName,
        fileContents,
      },
      async () => {
        const fileStream = fs.createReadStream(fileName);

        const rl = readline.createInterface({
          input: fileStream,
          crlfDelay: Infinity,
        });

        let lineNo = 0;
        for await (const line of rl) {
          lineNo++;

          if (
            line.trim().startsWith("#") ||
            line.trim().startsWith("//") ||
            !line
          ) {
            continue;
          }

          const idx = line.indexOf(" ");
          const command = idx == -1 ? line : line.substring(0, idx);
          const rest = idx == -1 ? "" : line.substring(idx + 1);
          const position = {
            start: { column: idx + 2, line: lineNo },
            end: { column: line.length + 1, line: lineNo },
          };

          await simulation.withMeta(
            {
              lineNo,
              position,
            },
            async () => {
              // console.log(`[${new Date().toISOString()}] ${fileName}:${lineno} ${line}`);

              if (command == "restart") {
                await simulation.restart();
              } else if (command == "accuracy") {
                simulation.accuracy = parseInt(rest);
              } else if (command == "chatbot") {
                chatbot = rest.trim().toLowerCase();
              } else if (command == "settings") {
                const data: unknown = JSON.parse(rest);
                if (simulation.isSettings(data)) {
                  simulation.settings = data;
                } else {
                  throw new Error("Invalid settings");
                }
              } else if (command == "chatters") {
                const users = rest.split(",");
                simulation.chatters = users
                  .map((user) => user.trim())
                  .filter((user) => user !== "")
                  .map((user) => parseChatter(user));
              } else if (command.startsWith("queue.json")) {
                let jsonData: unknown = simulation.readQueueData();
                const memberIdx = command.indexOf("/");
                if (memberIdx != -1) {
                  const members = command.substring(memberIdx + 1).split("/");
                  for (const member of members) {
                    jsonData = z
                      .object({ [member]: z.unknown() })
                      .parse(jsonData)[member];
                  }
                }
                if (fixingTests) {
                  if (!_.isEqual(jsonData, JSON.parse(rest))) {
                    fixInstructions.push({
                      contents: JSON.stringify(jsonData),
                      json: true,
                      position,
                    });
                  }
                } else {
                  expect(jsonData).toEqual(JSON.parse(rest));
                }
              } else if (command.startsWith("extensions")) {
                const args = command.split("/");
                let jsonData: unknown = simulation.readExtensionData(args[1]);
                if (2 in args) {
                  const member = args[2];
                  jsonData = z
                    .object({ [member]: z.unknown() })
                    .parse(jsonData)[member];
                }
                expect(jsonData).toEqual(JSON.parse(rest));
              } else if (command.startsWith("save")) {
                const fileName = command.substring(command.indexOf(":") + 1);
                if (fileName === "data/queue.json") {
                  simulation.writeQueueData(JSON.parse(rest));
                } else if (fileName === "data/extensions/customcode.json") {
                  simulation.writeExtensionData("customcode", JSON.parse(rest));
                } else {
                  throw new Error(`Unsupported file path: ${fileName}`);
                }
              } else if (command == "random") {
                simulation.nextRandom(parseFloat(rest));
              } else if (command == "uuidv4") {
                simulation.nextUuid(rest.trim());
              } else if (command == "fs-fail") {
                if (simulation.isFsFunction(rest)) {
                  simulation.nextFsFail(rest);
                } else {
                  throw new Error(
                    `The function ${rest} is not part of the file system!`
                  );
                }
              } else if (command == "time") {
                await simulation.setTime(new Date(Date.parse(rest)), false);
              } else if (command.startsWith("[") && command.endsWith("]")) {
                await simulation.setTime(
                  command.substring(1, command.length - 1)
                );
                // const time = new Date();
                const chat = parseMessage(rest);

                await simulation.withMeta(
                  {
                    position: {
                      start: { column: idx + 1 + chat.column, line: lineNo },
                      end: {
                        column: line.length + 1 - chat.trimLen,
                        line: lineNo,
                      },
                    },
                  },
                  async () => {
                    // console.log(`${time}`, chat.sender, 'sends', chat.message);
                    // console.log("sender", chat.sender.username, "settings", index.settings.username.toLowerCase());
                    if (
                      chatbot != null &&
                      chat.sender.name == chatbot.toLowerCase()
                    ) {
                      // this is a message by the chat bot, check replyMessageQueue
                      const shift = simulation.responses.shift();
                      if (shift === undefined) {
                        expect(simulation.responses).toContain(chat.message);
                      }
                      if (fixingTests && shift !== undefined) {
                        if (!_.isEqual(shift.message, chat.message)) {
                          fixInstructions.push({
                            contents: shift.message,
                            position,
                          });
                        }
                      } else {
                        await simulation.withMeta(
                          {
                            response: shift,
                          },
                          () => {
                            expect(shift?.message).toBe(chat.message);
                          }
                        );
                      }
                    } else {
                      await simulation.sendMessage(chat.message, chat.sender);
                    }
                  }
                );
              } else {
                throw Error(`unexpected line "${line}" in file ${fileName}`);
              }
            }
          );
        }

        await simulation.withMeta(
          {
            response: () => simulation.responses.shift(),
          },
          () => {
            expect(simulation.responses.map((m) => m.message)).toEqual([]);
          }
        );
      }
    );
  } finally {
    await clearAllTimers();
  }
  return fixInstructions;
};

const testFiles = fs
  .readdirSync(
    path.resolve(path.dirname(fileURLToPath(import.meta.url)), "chat")
  )
  .filter((file: string) => file.endsWith(".test.log"));

function isFixingTests() {
  if (
    !["true", "yes", "1", "y"].includes(process.env.FIX?.toLowerCase() ?? "no")
  ) {
    return false;
  }
  try {
    execSync("git diff-files --quiet");
    return true;
  } catch (error) {
    console.error(error);
    console.error(`Ignoring FIX`);
    return false;
  }
}

const fixingTests = isFixingTests();

for (const file of testFiles) {
  const fileName = path.relative(
    ".",
    path.resolve(path.dirname(fileURLToPath(import.meta.url)), `chat/${file}`)
  );
  test(`${fileName}`, async () => {
    jest.setTimeout(10_000); // <- this might not work
    const result = await chatLogTest(fileName, fixingTests);
    if (result.length > 0) {
      const replacements = new Map(
        result.map((v) => [
          v.position.start.line,
          {
            contents: v.contents,
            start: v.position.start.column,
            end: v.position.end?.column,
            json: v.json ?? false,
          },
        ])
      );
      const input = fs.createReadStream(fileName);
      let output = "";
      const rl = readline.createInterface({
        input,
        crlfDelay: Infinity,
      });
      let lineno = 0;
      for await (const line of rl) {
        lineno++;
        const replace = replacements.get(lineno);
        if (
          replace === undefined ||
          replace.start === undefined ||
          replace.end === undefined
        ) {
          output += `${line}\n`;
          continue;
        }
        let m;
        if (replace.json) {
          const oldOrder = jsonOrder.default.parse(
            line.substring(replace.start - 1, replace.end + 1)
          );
          const newOrder = jsonOrder.default.parse(replace.contents);
          for (const key in newOrder.map) {
            if (key in oldOrder.map) {
              const propertyOrder = oldOrder.map[key];
              for (const propertyKey of propertyOrder) {
                if (!newOrder.map[key].includes(propertyKey)) {
                  propertyOrder.splice(propertyOrder.indexOf(propertyKey));
                }
              }
              for (const propertyKey of newOrder.map[key]) {
                if (!propertyOrder.includes(propertyKey)) {
                  propertyOrder.push(propertyKey);
                }
              }
              newOrder.map[key] = propertyOrder;
            }
          }
          m = jsonOrder.default.stringify(newOrder.object, newOrder.map);
        } else {
          m = replace.contents;
        }
        const r =
          line.substring(0, replace.start - 1) +
          m +
          line.substring(replace.end + 1);
        output += `${r}\n`;
      }
      await writeFileAtomic(fileName, output, { encoding: "utf-8" });
    }
    expect(result).toBeTruthy();
  }, 10_000); // <- setting timeout here as well
}
