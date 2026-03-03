// src/errors/error-types.ts

export class BriefError extends Error {
  constructor(
    message: string,
    public readonly type: string,
    public readonly suggestion?: string,
    public readonly code?: string,
  ) {
    super(message);
    this.name = "BriefError";
    // Restore prototype chain for correct instanceof checks
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

export class InvalidInputError extends BriefError {
  constructor(message: string, suggestion?: string | { suggestion?: string }) {
    const resolved =
      typeof suggestion === "object" && suggestion !== null
        ? suggestion.suggestion
        : suggestion;
    super(message, "invalid_input", resolved);
    this.name = "InvalidInputError";
  }
}

export class NotFoundError extends BriefError {
  constructor(message: string, suggestion?: string) {
    super(message, "not_found", suggestion);
    this.name = "NotFoundError";
  }
}

export class ParseWarningError extends BriefError {
  constructor(message: string, suggestion?: string) {
    super(message, "parse_warning", suggestion);
    this.name = "ParseWarningError";
  }
}

export class SystemError extends BriefError {
  constructor(message: string, suggestion?: string) {
    super(message, "system_error", suggestion);
    this.name = "SystemError";
  }
}

export class InternalError extends BriefError {
  constructor(message: string, suggestion?: string) {
    super(message, "internal_error", suggestion);
    this.name = "InternalError";
  }
}

export class SecurityLimitExceededError extends InvalidInputError {
  readonly subtype = "security_limit_exceeded" as const;

  constructor(
    public readonly limitName: string,
    public readonly actualValue: number,
    public readonly configuredLimit: number,
  ) {
    const message = `Security limit exceeded: ${limitName} (actual: ${actualValue}, configured limit: ${configuredLimit})`;
    const suggestion = `Reduce the value of ${limitName} to at most ${configuredLimit}.`;
    super(message, suggestion);
    this.name = "SecurityLimitExceededError";
  }
}
