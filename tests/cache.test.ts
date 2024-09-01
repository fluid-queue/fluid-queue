import { jest } from "@jest/globals";
import { ConcurrentLoader, SingleValueCache } from "fluid-queue/cache.js";
import { BroadcastOnce } from "fluid-queue/sync.js";
import { Duration } from "@js-joda/core";

test("BroadcastOnce:value", async () => {
  jest.useRealTimers();
  const channel = new BroadcastOnce();
  const recv1 = channel.recv();
  const recv2 = channel.recv();
  const recv3 = channel.recv();
  const value = "uwu";
  // sending the value
  channel.send(value);
  // will make every subscriber receive the exact value
  await expect(recv1).resolves.toBe(value);
  await expect(recv2).resolves.toBe(value);
  await expect(recv3).resolves.toBe(value);
});

test("BroadcastOnce:value:send-twice", async () => {
  jest.useRealTimers();
  const channel = new BroadcastOnce();
  const recv1 = channel.recv();
  const recv2 = channel.recv();
  const recv3 = channel.recv();
  const value = "uwu";
  // sending the value
  channel.send(value);
  // will make every subscriber receive the exact value
  await expect(recv1).resolves.toBe(value);
  await expect(recv2).resolves.toBe(value);
  await expect(recv3).resolves.toBe(value);
  // sending another value will fail!
  expect(() => channel.send(value)).toThrow(/value has already been sent/);
});

test("BroadcastOnce:value:recv-after-send", async () => {
  jest.useRealTimers();
  const channel = new BroadcastOnce();
  const recv1 = channel.recv();
  const recv2 = channel.recv();
  const recv3 = channel.recv();
  const value = "uwu";
  // sending the value
  channel.send(value);
  // subscribing after a value has been sent will fail!
  expect(() => channel.recv()).toThrow(/value has already been sent/);
  // and every subscriber received the exact value
  await expect(recv1).resolves.toBe(value);
  await expect(recv2).resolves.toBe(value);
  await expect(recv3).resolves.toBe(value);
});

test("BroadcastOnce:Promise:resolve", async () => {
  jest.useRealTimers();
  const channel = new BroadcastOnce();
  const recv1 = channel.recv();
  const recv2 = channel.recv();
  const recv3 = channel.recv();
  const value = "uwu";
  // sending a promise of the value
  channel.send(Promise.resolve(value));
  // will make every subscriber receive the value and not the Promise
  await expect(recv1).resolves.toBe(value);
  await expect(recv2).resolves.toBe(value);
  await expect(recv3).resolves.toBe(value);
});

test("BroadcastOnce:Promise:reject", async () => {
  jest.useRealTimers();
  const channel = new BroadcastOnce();
  const recv1 = channel.recv();
  const recv2 = channel.recv();
  const recv3 = channel.recv();
  const value = new Error("owo");
  // sending a promise with an rejection
  channel.send(Promise.reject(value));
  // will make every subscriber reject!
  await expect(recv1).rejects.toThrow(value);
  await expect(recv2).rejects.toThrow(value);
  await expect(recv3).rejects.toThrow(value);
});

test("ConcurrentLoader:fetch-concurrently", async () => {
  jest.useRealTimers();
  let number = 42;
  const fetchMethod = jest.fn(async () => {
    // sleep 100ms
    await new Promise((resolve) => setTimeout(resolve, 100));
    // increment number and return previous number
    return number++;
  });
  const loader = new ConcurrentLoader(fetchMethod);
  // calling fetch multiple times
  const fetch1 = loader.fetch();
  const fetch2 = loader.fetch();
  const fetch3 = loader.fetch();
  const [result1, result2, result3] = await Promise.all([
    fetch1,
    fetch2,
    fetch3,
  ]);
  expect(fetchMethod).toHaveBeenCalledTimes(1);
  // every promise returned with the same result
  expect(result1).toEqual(42);
  expect(result2).toEqual(42);
  expect(result3).toEqual(42);
  // next fetch returns new result
  await expect(loader.fetch()).resolves.toEqual(43);
  expect(fetchMethod).toHaveBeenCalledTimes(2);
});

test("ConcurrentLoader:fetch-concurrently-throw", async () => {
  jest.useRealTimers();
  let number = 42;
  const fetchMethod = jest.fn(async () => {
    // sleep 100ms
    await new Promise((resolve) => setTimeout(resolve, 100));
    // throw error in async function, so calling fetchMethod does not throw immediatly
    throw new Error(`ConcurrentLoader:fetch-concurrently-throw ${number++}`);
  });
  const loader = new ConcurrentLoader(fetchMethod);
  // calling fetch multiple times
  const fetch1 = loader.fetch();
  const fetch2 = loader.fetch();
  const fetch3 = loader.fetch();
  // every promise rejects with the same error
  await expect(fetch1).rejects.toThrow(
    /ConcurrentLoader:fetch-concurrently-throw 42/
  );
  await expect(fetch2).rejects.toThrow(
    /ConcurrentLoader:fetch-concurrently-throw 42/
  );
  await expect(fetch3).rejects.toThrow(
    /ConcurrentLoader:fetch-concurrently-throw 42/
  );
  expect(fetchMethod).toHaveBeenCalledTimes(1);
  // next fetch returns new result
  await expect(loader.fetch()).rejects.toThrow(
    /ConcurrentLoader:fetch-concurrently-throw 43/
  );
  expect(fetchMethod).toHaveBeenCalledTimes(2);
  // calling fetchMethod does not throw immediatly!
  const result = fetchMethod();
  await expect(result).rejects.toThrow(
    /ConcurrentLoader:fetch-concurrently-throw 44/
  );
});

test("ConcurrentLoader:fetch-concurrently-reject", async () => {
  jest.useRealTimers();
  let number = 42;
  const fetchMethod = jest.fn(() => {
    // sleep 100ms
    return new Promise((resolve) => setTimeout(resolve, 100)).then(
      // then reject
      () =>
        Promise.reject(
          new Error(`ConcurrentLoader:fetch-concurrently-reject ${number++}`)
        )
    );
  });
  const loader = new ConcurrentLoader(fetchMethod);
  // calling fetch multiple times
  const fetch1 = loader.fetch();
  const fetch2 = loader.fetch();
  const fetch3 = loader.fetch();
  // every promise rejects with the same error
  await expect(fetch1).rejects.toThrow(
    /ConcurrentLoader:fetch-concurrently-reject 42/
  );
  await expect(fetch2).rejects.toThrow(
    /ConcurrentLoader:fetch-concurrently-reject 42/
  );
  await expect(fetch3).rejects.toThrow(
    /ConcurrentLoader:fetch-concurrently-reject 42/
  );
  expect(fetchMethod).toHaveBeenCalledTimes(1);
  // next fetch returns new result
  await expect(loader.fetch()).rejects.toThrow(
    /ConcurrentLoader:fetch-concurrently-reject 43/
  );
  expect(fetchMethod).toHaveBeenCalledTimes(2);
});

test("ConcurrentLoader:fetch-method-throws", async () => {
  jest.useRealTimers();
  const fetchMethod = () => {
    // ConcurrentLoader can deal with errors thrown in the fetchMethod
    throw new Error("ConcurrentLoader:fetch-method-throws");
  };
  const loader = new ConcurrentLoader(fetchMethod);
  // loader.fetch() does not throw, but rejects!
  await expect(loader.fetch()).rejects.toThrow(
    /ConcurrentLoader:fetch-method-throws/
  );
  // fetchMethod does throw immediatly
  expect(() => fetchMethod()).toThrow();
});

test("SingleValueCache:ttl", async () => {
  jest.useFakeTimers();
  const fetchMethod = jest.fn((): Promise<string | null> => {
    return Promise.resolve(null);
  });
  const cache = new SingleValueCache(
    fetchMethod,
    "init",
    Duration.ofSeconds(30)
  );
  // cache is stale if fetch was not used even if it has an initial value
  expect(cache.isStale).toBe(true);
  expect(cache.get()).toEqual("init");
  fetchMethod
    .mockResolvedValueOnce("new value")
    .mockResolvedValueOnce("next value");
  expect(fetchMethod).toHaveBeenCalledTimes(0);
  // load a new value
  await expect(cache.fetch()).resolves.toEqual("new value");
  expect(fetchMethod).toHaveBeenCalledTimes(1);
  expect(cache.isStale).toBe(false);
  expect(cache.get()).toEqual("new value");

  // wait for 10s, cache is not stale yet! so fetch doesn't reload
  jest.advanceTimersByTime(10_000);
  await expect(cache.fetch()).resolves.toEqual("new value");
  expect(fetchMethod).toHaveBeenCalledTimes(1); // not realoaded yet!
  expect(cache.isStale).toBe(false);
  expect(cache.get()).toEqual("new value");

  // wait for 20 more seconds
  jest.advanceTimersByTime(20_000);
  // value is now stale
  expect(cache.isStale).toBe(true);
  // cache is still returned
  expect(cache.get()).toEqual("new value");

  // value is realoaded
  await expect(cache.fetch()).resolves.toEqual("next value");
  expect(fetchMethod).toHaveBeenCalledTimes(2);
  expect(cache.isStale).toBe(false);
  expect(cache.get()).toEqual("next value");

  // wait 29_999 ms
  jest.advanceTimersByTime(29_999);
  expect(cache.isStale).toBe(false);
  // wait 1 more ms
  jest.advanceTimersByTime(1);
  expect(cache.isStale).toBe(true);
});

test("SingleValueCache:error", async () => {
  jest.useFakeTimers();
  const fetchMethod = jest.fn((): Promise<string | null> => {
    return Promise.resolve(null);
  });
  const cache = new SingleValueCache(
    fetchMethod,
    "init",
    Duration.ofSeconds(30)
  );
  // cache is stale if fetch was not used even if it has an initial value
  expect(cache.isStale).toBe(true);
  expect(cache.get()).toEqual("init");
  fetchMethod.mockResolvedValueOnce("value").mockRejectedValueOnce("ERROR");
  expect(fetchMethod).toHaveBeenCalledTimes(0);
  // load a new value
  await expect(cache.fetch()).resolves.toEqual("value");
  expect(fetchMethod).toHaveBeenCalledTimes(1);
  expect(cache.isStale).toBe(false);
  expect(cache.get()).toEqual("value");

  // wait for 30 seconds
  jest.advanceTimersByTime(30_000);
  // value is now stale
  expect(cache.isStale).toBe(true);
  // cache is still returned
  expect(cache.get()).toEqual("value");

  // value is realoaded, but there is an error, so it returns the old value
  await expect(cache.fetch()).resolves.toEqual("value");
  expect(fetchMethod).toHaveBeenCalledTimes(2);
  // value is still stale
  expect(cache.isStale).toBe(true);
  expect(cache.get()).toEqual("value");
});

test("SingleValueCache:fetch-concurrently", async () => {
  jest.useFakeTimers();
  const fetchMethod = jest.fn((): Promise<string | null> => {
    return Promise.resolve(null);
  });
  const cache = new SingleValueCache(
    fetchMethod,
    "init",
    Duration.ofSeconds(30)
  );
  // cache is stale if fetch was not used even if it has an initial value
  expect(cache.isStale).toBe(true);
  expect(cache.get()).toEqual("init");
  fetchMethod
    .mockResolvedValueOnce("value")
    .mockImplementationOnce(async () => {
      // sleep 100ms
      await new Promise((resolve) => setTimeout(resolve, 100));
      return "meow";
    });
  expect(fetchMethod).toHaveBeenCalledTimes(0);
  // load a new value
  await expect(cache.fetch()).resolves.toEqual("value");
  expect(fetchMethod).toHaveBeenCalledTimes(1);
  expect(cache.isStale).toBe(false);
  expect(cache.get()).toEqual("value");

  // wait for 30 seconds
  jest.advanceTimersByTime(30_000);
  // value is now stale
  expect(cache.isStale).toBe(true);
  // cache is still returned
  expect(cache.get()).toEqual("value");

  // value is realoaded at the same time
  const fetch1 = cache.fetch();
  const fetch2 = cache.fetch();
  const fetch3 = cache.fetch();
  // advance time, so value can be loaded
  // there is a sleep in the fetch method
  jest.advanceTimersByTime(100);
  const [result1, result2, result3] = await Promise.all([
    fetch1,
    fetch2,
    fetch3,
  ]);
  expect(result1).toEqual("meow");
  expect(result2).toEqual("meow");
  expect(result3).toEqual("meow");
  expect(fetchMethod).toHaveBeenCalledTimes(2);
  expect(cache.isStale).toBe(false);
  expect(cache.get()).toEqual("meow");
});

test("SingleValueCache:long-load", async () => {
  jest.useFakeTimers();
  const fetchMethod = jest.fn((): Promise<string | null> => {
    return Promise.resolve(null);
  });
  const cache = new SingleValueCache(
    fetchMethod,
    "init",
    Duration.ofSeconds(30)
  );
  // cache is stale if fetch was not used even if it has an initial value
  expect(cache.isStale).toBe(true);
  expect(cache.get()).toEqual("init");
  fetchMethod
    .mockResolvedValueOnce("value")
    .mockImplementationOnce(async () => {
      // sleep 60s, this is more than the TTL!
      await new Promise((resolve) => setTimeout(resolve, 60_000));
      return "meow";
    });
  expect(fetchMethod).toHaveBeenCalledTimes(0);
  // load a new value
  await expect(cache.fetch()).resolves.toEqual("value");
  expect(fetchMethod).toHaveBeenCalledTimes(1);
  expect(cache.isStale).toBe(false);
  expect(cache.get()).toEqual("value");

  // wait for 30 seconds
  jest.advanceTimersByTime(30_000);
  // value is now stale
  expect(cache.isStale).toBe(true);
  // cache is still returned
  expect(cache.get()).toEqual("value");

  // value is realoaded
  const fetch = cache.fetch();
  // wait for 30s
  jest.advanceTimersByTime(30_000);
  // wait for 30s again
  jest.advanceTimersByTime(30_000);
  // the value should resolve now
  await expect(fetch).resolves.toEqual("meow");
  expect(fetchMethod).toHaveBeenCalledTimes(2);
  // value is not stale even if it took longer than the TTL!
  // TODO: is this even wanted?
  expect(cache.isStale).toBe(false);
  expect(cache.get()).toEqual("meow");
});
