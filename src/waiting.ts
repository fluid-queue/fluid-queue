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

export const WaitingSchemeV3 = z.object({
  user: z.object({
    id: z.string(),
    name: z.string(),
    displayName: z.string(),
  }),
  waiting: z.object({ minutes: z.number().nonnegative() }),
  weight: z.object({
    minutes: z.number().nonnegative(),
    milliseconds: z.number().gte(0).lt(60000),
  }),
  lastOnline: z.string().datetime(),
});

export type WaitingV3 = z.output<typeof WaitingSchemeV3>;

export type WaitingUserV3 = WaitingV3["user"];

// Waiting prototype
export class Waiting {
  private user: WaitingUserV3;
  private waitTime: number;
  private weightMin: number;
  private weightMsec: number;
  private lastOnlineTime: string;

  private constructor(waiting: WaitingV3) {
    this.user = waiting.user;
    this.waitTime = waiting.waiting.minutes;
    this.weightMin = waiting.weight.minutes;
    this.weightMsec = waiting.weight.milliseconds;
    this.lastOnlineTime = waiting.lastOnline;
  }
  static create(user: WaitingUserV3, now?: string | Date): Waiting {
    return new Waiting({
      user,
      waiting: { minutes: 1 },
      weight: { minutes: 1, milliseconds: 0 },
      lastOnline: timeOrNow(now),
    });
  }
  static from(waiting: WaitingV3): Waiting {
    return new Waiting(waiting);
  }
  static fromList(waiting: WaitingV3[]): Record<string, Waiting> {
    return Object.fromEntries(
      waiting.map((value) => {
        return [value.user.id, Waiting.from(value)];
      })
    );
  }
  static recordToJson(waiting: Record<string, Waiting>): WaitingV3[] {
    return Object.values(waiting).map((v) => v.toJson());
  }
  toJson(): WaitingV3 {
    return {
      user: {
        id: this.user.id,
        name: this.user.name,
        displayName: this.user.displayName,
      },
      waiting: { minutes: this.waitTime },
      weight: { minutes: this.weightMin, milliseconds: this.weightMsec },
      lastOnline: this.lastOnlineTime,
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
