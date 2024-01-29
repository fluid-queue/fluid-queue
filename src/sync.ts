// TODO: find a better name for this
function channel<T>(): [
  promise: Promise<T>,
  resolve: (value: T | PromiseLike<T>) => void,
  reject: (reason?: unknown) => void,
] {
  let captureResolve;
  let captureReject;
  const promise = new Promise<T>((resolve, reject) => {
    captureResolve = resolve;
    captureReject = reject;
  });
  if (captureResolve === undefined || captureReject === undefined) {
    throw new Error("unreachable");
  }
  return [promise, captureResolve, captureReject];
}

export class SendOnce<T> {
  private promise: Promise<T>;
  private resolve: (value: T | PromiseLike<T>) => void;

  constructor() {
    const [promise, resolve] = channel<T>();
    this.promise = promise;
    this.resolve = resolve;
  }

  /**
   * @param value This value is sent to the subscriber.
   */
  send(value: T | PromiseLike<T>): void {
    this.resolve(value);
  }

  /**
   * Subscribe and receive the value when it is send.
   *
   * @returns A promise to the value that will be send.
   */
  recv(): Promise<T> {
    return this.promise;
  }
}

/**
 * This class provides a channel where only one message can be sent.
 * The message being sent is broadcast to all subscribers to the channel.
 */
export class BroadcastOnce<T> {
  private subscribers: ((value: T | PromiseLike<T>) => void)[] | null = [];

  /**
   * @param value This value is sent to all subscribers.
   */
  send(value: T | PromiseLike<T>): void {
    if (this.subscribers == null) {
      throw new Error(`${this.constructor.name}: value has already been sent.`);
    }
    this.subscribers.forEach((resolve) => resolve(value));
    this.subscribers = null;
  }

  /**
   * Subscribe and receive the value when it is send.
   *
   * @returns A promise to the value that will be send.
   */
  recv(): Promise<T> {
    if (this.subscribers == null) {
      throw new Error(`${this.constructor.name}: value has already been sent.`);
    }
    const [promise, resolve] = channel<T>();
    this.subscribers.push(resolve);
    return promise;
  }
}
