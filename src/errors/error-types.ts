// src/errors/error-types.ts — stub for TASK-04
// Replace with real implementation during build loop.

export class BriefError extends Error {
  constructor(
    message: string,
    public readonly type: string,
    public readonly suggestion?: string,
    public readonly code?: string,
  ) {
    super(message);
    this.name = "BriefError";
  }
}

export class UserError extends BriefError {
  constructor(message: string, suggestion?: string) {
    super(message, "invalid_input", suggestion);
    this.name = "UserError";
  }
}

export class NotFoundError extends BriefError {
  constructor(message: string, suggestion?: string) {
    super(message, "not_found", suggestion);
    this.name = "NotFoundError";
  }
}

export class DataError extends BriefError {
  constructor(message: string, suggestion?: string) {
    super(message, "parse_warning", suggestion);
    this.name = "DataError";
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

export class SecurityLimitError extends UserError {
  constructor(
    message: string,
    public readonly limitName: string,
    public readonly actualValue: unknown,
    public readonly configuredLimit: unknown,
    public readonly howToAdjust?: string,
  ) {
    super(message, howToAdjust);
    this.name = "SecurityLimitError";
  }
}
