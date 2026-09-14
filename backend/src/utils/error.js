class ValidationError extends Error {
  constructor(message, details = null) {
    super(message);
    this.name = "ValidationError";
    this.statusCode = 400;
    this.type = "validation";
    this.details = details;
  }
}

class NotFoundError extends Error {
  constructor(message) {
    super(message);
    this.name = "NotFoundError";
    this.statusCode = 404;
    this.type = "not_found";
  }
}

// The request was well-formed but collides with something already on file —
// a name that already belongs to another vendor, say. Not a 400 (nothing is
// wrong with what was sent) and not a 404; the client shows the message.
class ConflictError extends Error {
  constructor(message) {
    super(message);
    this.name = "ConflictError";
    this.statusCode = 409;
    this.type = "conflict";
  }
}

class AuthError extends Error {
  constructor(message) {
    super(message);
    this.name = "AuthError";
    this.statusCode = 401;
    this.type = "auth_error";
  }
}

class ForbiddenError extends Error {
  constructor(message) {
    super(message);
    this.name = "ForbiddenError";
    this.statusCode = 403;
    this.type = "forbidden_error";
  }
}

export {
  ValidationError,
  NotFoundError,
  ConflictError,
  AuthError,
  ForbiddenError,
};
