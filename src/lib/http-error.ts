// Only explicitly classified application errors may expose their message.
export class HttpError extends Error {
  constructor(message: string, public readonly status = 400) {
    super(message);
    this.name = "HttpError";
  }
}
