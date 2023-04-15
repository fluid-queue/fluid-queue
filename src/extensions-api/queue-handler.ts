import { QueueEntry } from "./queue-entry.js";

export interface QueueHandler {
  check?(allEntried: QueueEntry[]): boolean;
}

export interface QueueHandlersApi {
  registerQueueHandler(queueHandler: QueueHandler): void;
}

export class QueueHandlers {
  private handlers: QueueHandler[] = [];
  register(handler: QueueHandler) {
    this.handlers.push(handler);
  }

  check(allEntries: QueueEntry[]): boolean {
    let changed = false;
    for (const handler of this.handlers) {
      if (handler.check != null) {
        changed = handler.check(allEntries) || changed;
      }
    }
    return changed;
  }

  get api(): QueueHandlersApi {
    return {
      registerQueueHandler: this.register.bind(this),
    };
  }
}
