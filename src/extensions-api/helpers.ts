export type EmptyObject = Omit<{ empty: never }, "empty">;

export type Result<Data extends object, Error extends object = EmptyObject> =
  | (Data & { success: true })
  | (Error & { success: false });

export type FunctionOrData<
  Type,
  Arguments extends unknown[]
> = Type extends () => unknown
  ? (...args: Arguments) => Type
  : ((...args: Arguments) => Type) | Type;

export type Serialize<T, Arguments extends unknown[] = []> = (
  value: T,
  ...args: Arguments
) => unknown;
export type Deserialize<T> = (value: unknown) => T;

export interface Serializer<T, Arguments extends unknown[] = []> {
  serialize: Serialize<T, Arguments>;
}

export interface Deserializer<T> {
  deserialize: Deserialize<T>;
}

export function notNullish<T>(value: T | null | undefined): value is T {
  return value != null;
}
