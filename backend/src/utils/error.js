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

export { ValidationError, NotFoundError, AuthError, ForbiddenError };
