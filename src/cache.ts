import { Duration, Instant } from "@js-joda/core";
import { BroadcastOnce } from "./sync.js";
import { error } from "./chalk-print.js";

/**
 * This class creates an adapter for loading data asynchronously.
 * Calls to {@link ConcurrentLoader.fetch} while data is still being loaded will resolve to the same result as the data that is currently being loaded.
 *
 */
export class ConcurrentLoader<T> {
  private fetchMethod: () => Promise<T>;
  private fetching: BroadcastOnce<T> | null = null;

  /**
   * @param fetchMethod - The function to be used to load a new value.
   */
  constructor(fetchMethod: () => T | PromiseLike<T>) {
    this.fetchMethod = async () => {
      // create an async function to handle errors and immediate values
      return await Promise.resolve(fetchMethod());
    };
  }

  /**
   * Loads the value
   *
   * @returns The new value.
   */
  async fetch(): Promise<T> {
    if (this.fetching != null) {
      return await this.fetching.recv();
    }
    this.fetching = new BroadcastOnce();
    // bind the send function, because this.#loading will be set to null before sending the result
    const send = this.fetching.send.bind(this.fetching);
    const completeWith = (result: Promise<T>) => {
      // new calls to fetch will start a new load
      this.fetching = null;
      // every call that happened during this load will resolve to the result
      send(result);
      // finally resolve to the result
      return result;
    };
    return await this.fetchMethod().then(
      (value) => completeWith(Promise.resolve(value)),
      (reason) => completeWith(Promise.reject(reason))
    );
  }
}

export class SingleValueCache<T> {
  private value: T;
  private expiry: Instant | null = null;
  private timeToLive: Duration;
  private loader: ConcurrentLoader<T>;

  constructor(
    fetchMethod: () => T | PromiseLike<T>,
    initialValue: T,
    timeToLive: Duration
  ) {
    this.loader = new ConcurrentLoader(() => this.updateCache(fetchMethod));
    this.value = initialValue;
    this.timeToLive = timeToLive;
  }

  private async updateCache(fetchMethod: () => T | PromiseLike<T>): Promise<T> {
    try {
      this.value = await fetchMethod();
      this.expiry = Instant.now().plus(this.timeToLive);
    } catch (e) {
      // ignore error
      error(`Error loading cache: ${String(e)}`);
    }
    return this.value;
  }

  get isStale(): boolean {
    return this.expiry == null || this.expiry.compareTo(Instant.now()) <= 0;
  }

  /**
   * @returns The current value without fetching a new one.
   */
  get(): T {
    return this.value;
  }

  /**
   * Loads a new value and writes it into cache.
   * If loading fails nothing is written to cache and the cached value returns.
   * If this method is called multiple times before the first load resolves, then each consecutive call will wait for the first value to load.
   *
   * @returns A promise to the new value or returns the cached value if the loading throws an error.
   */
  async fetch(partialOptions: { forceRefresh?: boolean } = {}): Promise<T> {
    const defaultOptions = { forceRefresh: false };
    const options = { ...defaultOptions, ...partialOptions };
    if (options.forceRefresh || this.isStale) {
      return this.loader.fetch();
    }
    return this.value;
  }
}
