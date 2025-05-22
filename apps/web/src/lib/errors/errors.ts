export class RateLimitExceededError extends Error {
  constructor(message = 'Rate limit exceeded') {
    super(message);
    this.name = 'RateLimitExceededError';
  }
}

export class EmailDeliveryError extends Error {
  constructor(message = 'Failed to send email') {
    super(message);
    this.name = 'EmailDeliveryError';
  }
}
