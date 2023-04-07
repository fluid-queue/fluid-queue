/**
 * This class provides a channel where only one message can be sent.
 * The message being sent is broadcast to all subscribers to the channel.
 *
 * @template T
 */
class BroadcastOnce {
  /**
   * @type {?((T | PromiseLike<T>) => void)[]}
   */
  #subscribers = [];

  /**
   * @param {T | PromiseLike<T>} value This value is sent to all subscribers.
   * @returns {void}
   */
  send(value) {
    if (this.#subscribers == null) {
      throw new Error(`${this.constructor.name}: value has already been sent.`);
    }
    this.#subscribers.forEach((resolve) => resolve(value));
    this.#subscribers = null;
  }

  /**
   * Subscribe and receive the value when it is send.
   *
   * @returns {Promise<T>} A promise to the value that will be send.
   */
  recv() {
    if (this.#subscribers == null) {
      throw new Error(`${this.constructor.name}: value has already been sent.`);
    }
    return new Promise((resolve) => this.#subscribers.push(resolve));
  }
}

/**
 * This class creates an adapter for loading data asynchronously.
 * Calls to {@link ConcurrentLoader.fetch} while data is still being loaded will resolve to the same result as the data that is currently being loaded.
 *
 * @template T
 */
class ConcurrentLoader {
  /**
   * @type {() => Promise<T>}
   */
  #fetchMethod;
  /**
   * @type {?BroadcastOnce<T>}
   */
  #fetching = null;

  /**
   * @param {() => Promise<T>} load
   */
  constructor(fetchMethod) {
    this.#fetchMethod = async () => {
      return await fetchMethod();
    };
  }

  /**
   * Loads the value
   *
   * @returns {Promise<T>} The new value.
   */
  async fetch() {
    if (this.#fetching != null) {
      return await this.#fetching.recv();
    }
    this.#fetching = new BroadcastOnce();
    // bind the send function, because this.#loading will be set to null before sending the result
    const send = this.#fetching.send.bind(this.#fetching);
    const completeWith = (result) => {
      // new calls to fetch will start a new load
      this.#fetching = null;
      // every call that happened during this load will resolve to the result
      send(result);
      // finally resolve to the result
      return result;
    };
    return await this.#fetchMethod().then(
      (value) => completeWith(Promise.resolve(value)),
      (reason) => completeWith(Promise.reject(reason))
    );
  }
}

/**
 * @template T
 */
class SingleValueCache {
  /**
   * @type {T}
   */
  #value;
  /**
   * @type {?Date}
   */
  #lastWritten = null;
  /**
   * @type {number}
   */
  #timeToLiveMilliseconds;
  /**
   * @type {ConcurrentLoader<T>}
   */
  #loader;

  /**
   * @param {() => Promise<T>} fetchMethod
   * @param {T} initialValue
   * @param {number} timeToLiveMilliseconds
   */
  constructor(fetchMethod, initialValue, timeToLiveMilliseconds) {
    this.#loader = new ConcurrentLoader(() => this.#updateCache(fetchMethod));
    this.#value = initialValue;
    this.#timeToLiveMilliseconds = timeToLiveMilliseconds;
  }

  /**
   *
   * @param {() => Promise<T>} fetchMethod
   * @returns
   */
  async #updateCache(fetchMethod) {
    try {
      this.#value = await fetchMethod();
      this.#lastWritten = new Date();
    } catch (e) {
      // ignore error
      console.error(`Error loading cache: ${e}`);
    }
    return this.#value;
  }

  /**
   * @type {boolean}
   */
  get isStale() {
    return (
      this.#lastWritten == null ||
      new Date() - this.#lastWritten >= this.#timeToLiveMilliseconds
    );
  }

  /**
   * @returns {T} The current value without fetching a new one.
   */
  get() {
    return this.#value;
  }

  /**
   * Loads a new value and writes it into cache.
   * If loading fails nothing is written to cache and the cached value returns.
   * If this method is called multiple times before the first load resolves, then each consecutive call will wait for the first value to load.
   *
   * @returns {Promise<T>} A promise to the new value or returns the cached value if the loading throws an error.
   */
  async fetch(options = {}) {
    options = { forceRefresh: false, ...options };
    if (options.forceRefresh || this.isStale) {
      return this.#loader.fetch();
    }
    return this.#value;
  }
}

module.exports = {
  BroadcastOnce,
  ConcurrentLoader,
  SingleValueCache,
};
