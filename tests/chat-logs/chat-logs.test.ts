// imports
import { jest } from "@jest/globals";
import path from "path";
import fs from "fs";
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
import { execSync } from "child_process";
import writeFileAtomic from "write-file-atomic";
import jsonOrder from "json-order";
import { instructions } from "./parser.js";
import _ from "lodash";

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

type FixInstruction = {
  contents: string;
  json?: boolean | undefined;
  position: {
    start: number;
    end: number;
  };
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
        const toChatter = (chatter: {
          username: string;
          displayName: string;
          isSubscriber: boolean;
          isMod: boolean;
          isBroadcaster: boolean;
        }) =>
          buildChatter(
            chatter.username,
            chatter.displayName,
            chatter.isSubscriber,
            chatter.isMod,
            chatter.isBroadcaster
          );
        const allInstructions = instructions().parse(
          fs.readFileSync(fileName, { encoding: "utf-8" })
        );
        for (const instruction of allInstructions.value) {
          await simulation.withMeta(
            {
              position: instruction.position,
            },
            async () => {
              const type = instruction.type;
              if (type === "restart") {
                await simulation.restart();
              } else if (type === "accuracy") {
                simulation.accuracy = instruction.accuracy;
              } else if (type === "chatbot") {
                chatbot = instruction.chatbot;
              } else if (type === "settings") {
                const data: unknown = JSON.parse(instruction.settings);
                if (simulation.isSettings(data)) {
                  simulation.settings = data;
                } else {
                  throw new Error("Invalid settings");
                }
              } else if (type === "chatters") {
                simulation.chatters = instruction.chatters.map(toChatter);
              } else if (type === "queue.json" || type === "extensions") {
                await simulation.withMeta(
                  {
                    position: instruction.jsonPosition,
                  },
                  () => {
                    let jsonData: unknown;
                    if (type === "queue.json") {
                      jsonData = simulation.readQueueData();
                    } else if (type === "extensions") {
                      const extension = instruction.path.shift();
                      expect(extension).not.toBeUndefined();
                      jsonData = simulation.readExtensionData(extension!);
                    } else {
                      throw new Error(
                        `Unsupported instruction type: ${type as string}`
                      );
                    }
                    for (const member of instruction.path) {
                      jsonData = z
                        .object({ [member]: z.unknown() })
                        .parse(jsonData)[member];
                    }
                    if (fixingTests) {
                      if (!_.isEqual(jsonData, JSON.parse(instruction.json))) {
                        fixInstructions.push({
                          contents: JSON.stringify(jsonData),
                          json: true,
                          position: instruction.jsonPosition,
                        });
                      }
                    } else {
                      expect(jsonData).toEqual(JSON.parse(instruction.json));
                    }
                  }
                );
              } else if (type === "save") {
                const path = instruction.path;
                if (path === "data/queue.json") {
                  simulation.writeQueueData(JSON.parse(instruction.json));
                } else if (path === "data/extensions/customcode.json") {
                  simulation.writeExtensionData(
                    "customcode",
                    JSON.parse(instruction.json)
                  );
                } else {
                  throw new Error(`Unsupported save path: ${path as string}`);
                }
              } else if (type === "random") {
                simulation.nextRandom(instruction.random);
              } else if (type === "uuidv4") {
                simulation.nextUuid(instruction.uuidv4);
              } else if (type === "fs-fail") {
                if (simulation.isFsFunction(instruction["fs-fail"])) {
                  simulation.nextFsFail(instruction["fs-fail"]);
                } else {
                  throw new Error(
                    `The function ${instruction["fs-fail"]} is not part of the file system!`
                  );
                }
              } else if (type === "time") {
                await simulation.setTime(instruction.time, false);
              } else if (type === "chat") {
                await simulation.setTime(instruction.time);
                await simulation.withMeta(
                  {
                    position: instruction.messagePosition,
                  },
                  async () => {
                    if (
                      chatbot != null &&
                      instruction.chatter.displayName == chatbot.toLowerCase()
                    ) {
                      const shift = simulation.responses.shift();
                      if (shift === undefined) {
                        expect(simulation.responses).toContain(
                          instruction.message
                        );
                      }
                      if (fixingTests && shift !== undefined) {
                        if (!_.isEqual(shift.message, instruction.message)) {
                          fixInstructions.push({
                            contents: shift.message,
                            position: instruction.messagePosition,
                          });
                        }
                      } else {
                        await simulation.withMeta(
                          {
                            response: shift,
                          },
                          () => {
                            expect(shift?.message).toBe(instruction.message);
                          }
                        );
                      }
                    } else {
                      await simulation.sendMessage(
                        instruction.message,
                        toChatter(instruction.chatter)
                      );
                    }
                  }
                );
              } else if (type !== "comment") {
                throw new Error(
                  `Unsupported instruction type: ${type as string}`
                );
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

function jsonWithOrder(json: string, orderJson: string) {
  const oldOrder = jsonOrder.default.parse(orderJson);
  const newOrder = jsonOrder.default.parse(json);
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
  return jsonOrder.default.stringify(newOrder.object, newOrder.map);
}

async function fixContents(fileName: string, result: FixInstruction[]) {
  result.sort((a, b) => b.position.start - a.position.start);
  let contents = fs.readFileSync(fileName, { encoding: "utf-8" });
  for (const replace of result) {
    const newContents = () => {
      if (replace.json) {
        const previousContents = contents.substring(
          replace.position.start - 1,
          replace.position.end + 1
        );
        return jsonWithOrder(replace.contents, previousContents);
      } else {
        return replace.contents;
      }
    };
    contents =
      contents.substring(0, replace.position.start) +
      newContents() +
      contents.substring(replace.position.end);
  }
  await writeFileAtomic(fileName, contents, { encoding: "utf-8" });
}

for (const file of testFiles) {
  const fileName = path.relative(
    ".",
    path.resolve(path.dirname(fileURLToPath(import.meta.url)), `chat/${file}`)
  );
  test(`${fileName}`, async () => {
    jest.setTimeout(10_000); // <- this might not work
    const result = await chatLogTest(fileName, fixingTests);
    if (result.length > 0) {
      await fixContents(fileName, result);
    }
    expect(result).toBeTruthy();
  }, 10_000); // <- setting timeout here as well
}
