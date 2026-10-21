export class StorageNotFoundError extends Error {
  constructor() {
    // The key is deliberately left out of the message, which may be logged.
    super("Stored object not found");
    this.name = "StorageNotFoundError";
  }
}

export class StorageNotConfiguredError extends Error {
  constructor(message) {
    super(message);
    this.name = "StorageNotConfiguredError";
  }
}
