// imports
import { MethodLikeKeys } from "jest-mock";
import { jest } from "@jest/globals";
import * as jestChance from "jest-chance";
import readline from "readline";
import path from "path";
import fs from "fs";
import { SourceLocation, codeFrameColumns } from "@babel/code-frame";
import {
  simRequireIndex,
  simSetTime,
  simSetChatters,
  buildChatter,
  replace,
  flushPromises,
  clearAllTimers,
  START_TIME,
  EMPTY_CHATTERS,
  asMock,
} from "../simulation.js";
import { Settings } from "../../src/settings-type.js";
import { fileURLToPath } from "url";
import * as uuidModule from "uuid";

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

let uuid: { v4: jest.Mock<() => string> } | null = null;

const mocks = async () => {
  jest.mock("uuid", () => {
    const originalModule = jest.requireActual<typeof uuidModule>("uuid");
    return {
      __esModule: true,
      ...originalModule,
      // mock v4
      v4: jest.fn(() => {
        return originalModule.v4();
      }),
    };
  });
  uuid = jest.requireMock<typeof uuid>("uuid");
};

test("setup", async () => {
  await simRequireIndex(undefined, undefined, undefined, mocks);
});

const parseMessage = (line: string) => {
  const idx = line.indexOf(":");
  let user = line.substring(0, idx).trim();
  let message = line.substring(idx + 1);
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
  let column = message.length;
  message = message.trimStart();
  column -= message.length;
  let trimLen = message.length;
  message = message.trimEnd();
  trimLen -= message.length;
  return {
    message: message.trim(),
    sender: buildChatter(
      username,
      displayName,
      isSubscriber,
      isMod,
      isBroadcaster
    ),
    column: idx + 2 + column,
    trimLen: trimLen,
  };
};

const chatLogTest = (fileName: string) => {
  return async () => {
    let test = await simRequireIndex(undefined, undefined, undefined, mocks);
    let chatbot = null;

    const replyMessageQueue: Array<{ message: string; error: Error }> = [];
    let accuracy = 0;

    function pushMessageWithStack(message: string) {
      const error = new Error("<Stack Trace Capture>");
      Error.captureStackTrace(error, pushMessageWithStack);
      replyMessageQueue.push({ message, error });
    }

    try {
      asMock(test.chatbot_helper.say).mockImplementation(pushMessageWithStack);

      const fileStream = fs.createReadStream(fileName);

      const rl = readline.createInterface({
        input: fileStream,
        crlfDelay: Infinity,
      });

      const errorMessage = (position: SourceLocation) => {
        const contents = codeFrameColumns(
          fs.readFileSync(fileName).toString(),
          position
        );
        return (
          "\n\n" + `given in test file ${fileName}:${lineno}` + "\n" + contents
        );
      };

      let lineno = 0;
      for await (const line of rl) {
        lineno++;
        if (
          line.trim().startsWith("#") ||
          line.trim().startsWith("//") ||
          !line
        ) {
          continue;
        }
        // console.log(`[${new Date().toISOString()}] ${fileName}:${lineno} ${line}`);
        const idx = line.indexOf(" ");
        const command = idx == -1 ? line : line.substring(0, idx);
        const rest = idx == -1 ? "" : line.substring(idx + 1);
        let position = {
          start: { column: idx + 2, line: lineno },
          end: { column: line.length + 1, line: lineno },
        };
        if (command == "restart") {
          const time = new Date();
          await clearAllTimers();
          test = await simRequireIndex(test.volume, test.settings, time, mocks);
          asMock(test.chatbot_helper.say).mockImplementation(
            pushMessageWithStack
          );
        } else if (command == "accuracy") {
          accuracy = parseInt(rest);
        } else if (command == "chatbot") {
          chatbot = rest.trim().toLowerCase();
        } else if (command == "settings") {
          // TODO: ideally new settings would be written to settings.json
          //       and settings.js could be reloaded instead to validate settings
          replace(test.settings, Settings.parse(JSON.parse(rest)));

          console.log("set settings to: " + JSON.stringify(test.settings));
        } else if (command == "chatters") {
          simSetChatters(JSON.parse(rest));
        } else if (command.startsWith("queue.json")) {
          try {
            const memberIdx = command.indexOf("/");
            let jsonData = JSON.parse(
              test.fs.readFileSync(
                path.resolve(
                  path.dirname(fileURLToPath(import.meta.url)),
                  "../../data/queue.json"
                ),
                "utf-8"
              )
            );
            if (memberIdx != -1) {
              const members = command.substring(memberIdx + 1).split("/");
              for (const member of members) {
                jsonData = jsonData[member];
              }
            }
            expect(jsonData).toEqual(JSON.parse(rest));
          } catch (error: unknown) {
            if (error instanceof Error) {
              error.message += errorMessage(position);
            }
            throw error;
          }
        } else if (command.startsWith("extensions")) {
          try {
            const args = command.split("/");
            let jsonData = JSON.parse(
              test.fs.readFileSync(
                path.resolve(
                  path.dirname(fileURLToPath(import.meta.url)),
                  `../../data/extensions/${args[1]}.json`
                ),
                "utf-8"
              )
            );
            if (2 in args) {
              const member = args[2];
              jsonData = jsonData[member];
            }
            expect(jsonData).toEqual(JSON.parse(rest));
          } catch (error: unknown) {
            if (error instanceof Error) {
              error.message += errorMessage(position);
            }
            throw error;
          }
        } else if (command.startsWith("save")) {
          const fileName = command.substring(command.indexOf(":") + 1);
          test.fs.writeFileSync(
            path.resolve(
              path.dirname(fileURLToPath(import.meta.url)),
              "../..",
              fileName
            ),
            rest
          );
        } else if (command == "seed") {
          const chance = jestChance.getChance(rest);
          test.random.mockImplementation(() => {
            return chance.random();
          });
        } else if (command == "flushPromises") {
          await flushPromises();
        } else if (command == "random") {
          test.random.mockImplementationOnce(() => parseFloat(rest));
        } else if (command == "uuidv4") {
          if (uuid == null) {
            throw new Error("Mocks not initialized!");
          }
          uuid.v4.mockImplementationOnce(() => rest.trim());
        } else if (command == "fs-fail") {
          if (
            !(
              rest in test.fs &&
              typeof (test.fs as Record<string, unknown>)[rest] === "function"
            )
          ) {
            throw new Error(
              `The function ${rest} is not part of the file system!`
            );
          }
          const key: MethodLikeKeys<typeof test.fs> = rest as MethodLikeKeys<
            typeof test.fs
          >;
          jest
            .spyOn(jest.requireMock<typeof fs>("fs"), key)
            .mockImplementationOnce(() => {
              throw new Error("fail on purpose in test");
            });
          jest.spyOn(test.fs, key).mockImplementationOnce(() => {
            throw new Error("fail on purpose in test");
          });
        } else if (command.startsWith("[") && command.endsWith("]")) {
          await simSetTime(command.substring(1, command.length - 1), accuracy);
          // const time = new Date();
          const chat = parseMessage(rest);
          position = {
            start: { column: idx + 1 + chat.column, line: lineno },
            end: { column: line.length + 1 - chat.trimLen, line: lineno },
          };
          // console.log(`${time}`, chat.sender, 'sends', chat.message);
          // console.log("sender", chat.sender.username, "settings", index.settings.username.toLowerCase());
          if (chatbot != null && chat.sender.login == chatbot.toLowerCase()) {
            // this is a message by the chat bot, check replyMessageQueue
            const shift = replyMessageQueue.shift();
            if (shift === undefined) {
              try {
                expect(replyMessageQueue).toContain(chat.message);
              } catch (error: unknown) {
                if (error instanceof Error) {
                  error.message += errorMessage(position);
                }
                throw error;
              }
            }
            try {
              expect(shift?.message).toBe(chat.message);
            } catch (error: unknown) {
              if (error instanceof Error) {
                error.stack = shift?.error.stack?.replace(
                  shift.error.message,
                  error.message + errorMessage(position)
                );
              }
              throw error;
            }
          } else {
            try {
              await test.handle_func(
                chat.message,
                chat.sender,
                test.chatbot_helper.say
              );
            } catch (error: unknown) {
              if (error instanceof Error) {
                error.message += errorMessage(position);
              }
              throw error;
            }
          }
        } else {
          fail(`unexpected line "${line}" in file ${fileName}`);
        }
      }

      // replyMessageQueue should be empty now!
      try {
        expect(replyMessageQueue.map((m) => m.message)).toEqual([]);
      } catch (error: unknown) {
        const shift = replyMessageQueue.shift();
        if (error instanceof Error) {
          error.stack = shift?.error.stack?.replace(
            shift.error.message,
            error.message + "\n\n" + `not given in test file ${fileName}`
          );
        }
        throw error;
      }
    } finally {
      await clearAllTimers();
    }
  };
};

const testFiles = fs
  .readdirSync(
    path.resolve(path.dirname(fileURLToPath(import.meta.url)), "chat")
  )
  .filter((file: string) => file.endsWith(".test.log"));

for (const file of testFiles) {
  const fileName = path.relative(
    ".",
    path.resolve(path.dirname(fileURLToPath(import.meta.url)), `chat/${file}`)
  );
  test(fileName, chatLogTest(fileName));
}
