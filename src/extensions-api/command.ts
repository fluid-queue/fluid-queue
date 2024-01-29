import { aliases as aliasesFunction } from "../aliases.js";
import { QueueSubmitter } from "./queue-entry.js";
const aliases = aliasesFunction();

export type Responder = (message: string) => void;

// TODO: move this somewhere else!
export interface Chatter extends QueueSubmitter {
  isSubscriber: boolean;
  isMod: boolean;
  isBroadcaster: boolean;
}

export interface CommandHandler {
  aliases: string[];
  handle(
    message: string,
    sender: Chatter,
    respond: Responder
  ): Promise<void> | void;
}

export interface CommandsApi {
  registerCommand(name: string, handler: CommandHandler): void;
}

export class Commands {
  private handlers: Record<string, CommandHandler> = {};
  register(name: string, handler: CommandHandler): void {
    this.handlers[name] = handler;
    aliases.addDefault(name, handler.aliases);
  }
  private getRemainder(s: string): string {
    const index = s.indexOf(" ");
    if (index == -1) {
      return "";
    }
    return s.substring(index + 1);
  }
  async handle(
    message: string,
    sender: Chatter,
    respond: Responder
  ): Promise<void> {
    for (const name in this.handlers) {
      if (aliases.isAlias(name, message)) {
        const handler = this.handlers[name];
        return await handler.handle(
          this.getRemainder(message),
          sender,
          respond
        );
      }
    }
  }
  get api(): CommandsApi {
    return {
      registerCommand: this.register.bind(this),
    };
  }
}
