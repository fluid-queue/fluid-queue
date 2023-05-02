export interface User {
  /**
   * The user id of this submitter.
   */
  id: string;
  /**
   * `username`, `login` name of this submitter.
   */
  name: string;
  /**
   * The display name of this submitter.
   *
   * Lowercasing the `displayName` does not give you the `name`/`username` if the display name is a localized display name!
   * @see https://blog.twitch.tv/en/2016/08/22/localized-display-names-e00ee8d3250a/
   */
  displayName: string;
}

/**
 * Represents the submitter of a level.
 *
 * To display the submitter in chat please use `toString()` explicitly or implicitly.
 */
export interface QueueSubmitter extends User {
  /**
   * @returns The display name of the submitter.
   */
  toString(): string;
  /**
   * Note: This method compares the first 2 present properties of both submitters in this order:
   * - `id`
   * - `name`
   * - `displayName`
   *
   * This means that if both objects have `name` set, then `displayName` is not compared at all.
   *
   * @param other A different submitter/user/chatter.
   * @returns true if and only if `this` and `other` are equal.
   */
  equals(other: Partial<QueueSubmitter>): boolean;
}

/**
 * This is the representation how a level is persisted in JSON without a submitter attached to the level.
 */
export interface PersistedEntry {
  type: string | null;
  code?: string;
  data?: unknown;
}

/**
 * Represents a level without submitter.
 * Use {@link QueueEntry} if a submitter ({@link QueueSubmitter}) is attached to the level.
 *
 * To display the submitter in chat please use `toString()` explicitly or implicitly.
 */
export interface Entry {
  /**
   * You can use this for sentences like these:
   * - `Currently playing ${this} submitted by ${this.submitter}.`
   * - `${this.submitter}, you have submitted ${this} to the queue.`
   * - `${this.submitter}, ${this} has been added to the queue.`
   * - `${this.submitter}, your level in the queue has been replaced with ${this}.`
   * - `Your custom code ${customCode} for ${this} has been added.`
   *
   * @returns The string representation of an entry.
   */
  toString(): string;
  /**
   * @returns An object to be able to save it to a JSON file.
   */
  serializePersistedEntry(): PersistedEntry;
}

export interface PersistedQueueEntry extends PersistedEntry {
  submitter: {
    id: string;
    name: string;
    displayName: string;
  };
}

export interface QueueEntry extends Entry {
  /**
   * @returns An object to be able to save it to a JSON file.
   */
  serializePersistedQueueEntry(): PersistedQueueEntry;
  /**
   * The submitter of this queue entry.
   */
  get submitter(): QueueSubmitter;
  /**
   * Rename the submitter.
   * @returns true if the user name or display name changed.
   */
  rename(submitter: QueueSubmitter): boolean;
}

/**
 * @param entry The persisted level data containing the submitter.
 * @returns A {@link QueueSubmitter} with all its functions from a {@link PersistedQueueEntry}.
 */
export function queueSubmitter(entry: PersistedQueueEntry): QueueSubmitter {
  return {
    ...entry.submitter,
    toString() {
      return this.displayName;
    },
    equals(other: Partial<QueueSubmitter>) {
      return isQueueSubmitter(this, other);
    },
  };
}

export function isQueueSubmitter(
  submitter: QueueSubmitter,
  other: Partial<QueueSubmitter>
): boolean {
  if (other.id !== undefined && submitter.id !== undefined) {
    return other.id == submitter.id;
  }
  if (other.name !== undefined) {
    return other.name == submitter.name;
  }
  if (other.displayName !== undefined) {
    return other.displayName == submitter.displayName;
  }
  return false;
}
