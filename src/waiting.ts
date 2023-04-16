import { z } from "zod";

const timeOrNow = (time: string | Date | undefined): string => {
  if (time === undefined) {
    return new Date().toISOString();
  } else if (typeof time === "string") {
    return time;
  } else {
    return time.toISOString();
  }
};

export const WaitingSchemeV2 = z
  .object({
    waitTime: z.number().nonnegative().describe("wait time in minutes"),
    weightMin: z
      .number()
      .nonnegative()
      .describe("the weighted time for weighted random in minutes")
      .optional(),
    weightMsec: z
      .number()
      .gte(0)
      .lt(60000)
      .describe(
        "the milliseconds part of the weight time, between 0 (inclusive) and 59999 (inclusive)"
      )
      .optional(),
    lastOnlineTime: z
      .string()
      .datetime()
      .describe(
        "the time someone was last online in the queue as ISO 8601 timestamp"
      ),
  })
  .transform((waiting) => {
    const weightMin = waiting.weightMin ?? waiting.waitTime;
    const weightMsec = waiting.weightMsec ?? 0;
    return { ...waiting, weightMin, weightMsec };
  });
export type WaitingV2 = z.infer<typeof WaitingSchemeV2>;

// Waiting prototype
export class Waiting {
  private waitTime: number;
  private weightMin: number;
  private weightMsec: number;
  private lastOnlineTime: string;

  private constructor(waiting: WaitingV2) {
    this.waitTime = waiting.waitTime;
    this.weightMin = waiting.weightMin;
    this.weightMsec = waiting.weightMsec;
    this.lastOnlineTime = waiting.lastOnlineTime;
  }
  static create(now?: string | Date): Waiting {
    return new Waiting({
      waitTime: 1,
      weightMin: 1,
      weightMsec: 0,
      lastOnlineTime: timeOrNow(now),
    });
  }
  static from(waiting: WaitingV2): Waiting {
    return new Waiting(waiting);
  }
  static fromRecord(
    waiting: Record<string, WaitingV2>
  ): Record<string, Waiting> {
    return Object.fromEntries(
      Object.entries(waiting).map(([key, value]) => {
        return [key, Waiting.from(value)];
      })
    );
  }
  static recordToJson(
    waiting: Record<string, Waiting>
  ): Record<string, WaitingV2> {
    return Object.fromEntries(
      Object.entries(waiting).map(([k, v]) => [k, v.toJson()])
    );
  }
  toJson(): WaitingV2 {
    return {
      waitTime: this.waitTime,
      weightMin: this.weightMin,
      weightMsec: this.weightMsec,
      lastOnlineTime: this.lastOnlineTime,
    };
  }
  addOneMinute(multiplier: number, now?: string | Date): void {
    const addMin = Math.floor(multiplier);
    const addMsec = Math.round((multiplier % 1) * 60000);
    this.weightMsec += addMsec;
    // minute overflow
    while (this.weightMsec >= 60000) {
      this.weightMsec -= 60000;
      this.weightMin += 1;
    }
    this.weightMin += addMin;
    this.waitTime += 1;
    this.lastOnlineTime = timeOrNow(now);
  }
  weight(): number {
    // round to nearest minute
    return this.weightMin + (this.weightMsec >= 30000 ? 1 : 0);
  }
}

export default Waiting;
