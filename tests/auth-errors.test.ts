import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { authErrorCode, errorMessage, toHebrewError, GENERIC_ERROR } from '@/lib/errors';

/**
 * Registration failures, as the person filling in the form experiences them.
 *
 * Every case below reached the user as "משהו השתבש. נסו שוב בעוד רגע." before
 * this mapping existed, which made a mistyped address, a project with signups
 * switched off, and a database trigger raising during signup indistinguishable
 * from one another — on the screen and, for the 5xx family, in the log too.
 *
 * The errors are built the way `@supabase/auth-js` builds them, because the
 * shape is the whole point: a 4xx arrives as `AuthApiError` carrying a machine
 * `code`, while every 5xx arrives as `AuthRetryableFetchError` carrying no code
 * at all (auth-js `handleError` short-circuits on status 500…530 before the
 * code is read). A mapping that only read `code` would miss exactly the
 * failures that matter most.
 */
class AuthApiError extends Error {
  __isAuthError = true;
  override name = 'AuthApiError';
  constructor(
    message: string,
    readonly status: number,
    readonly code?: string,
  ) {
    super(message);
  }
}

class AuthRetryableFetchError extends Error {
  __isAuthError = true;
  override name = 'AuthRetryableFetchError';
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}

class AuthWeakPasswordError extends AuthApiError {
  override name = 'AuthWeakPasswordError';
  constructor(
    message: string,
    status: number,
    readonly reasons: string[],
  ) {
    super(message, status, 'weak_password');
  }
}

describe('signing up', () => {
  it('names an address that already has an account', () => {
    const { code, message } = toHebrewError(
      new AuthApiError('User already registered', 422, 'user_already_exists'),
    );
    expect(code).toBe('EMAIL_TAKEN');
    expect(message).toBe('כבר קיים חשבון עם כתובת האימייל הזו');
  });

  it('names it under the admin API wording too', () => {
    expect(
      toHebrewError(
        new AuthApiError('A user with this email address has already been registered', 422, 'email_exists'),
      ).code,
    ).toBe('EMAIL_TAKEN');
  });

  it('reports an address the auth service refuses', () => {
    for (const error of [
      new AuthApiError('Email address "a@b" is invalid', 400, 'email_address_invalid'),
      new AuthApiError('Unable to validate email address: invalid format', 400, 'validation_failed'),
    ]) {
      const { code, message } = toHebrewError(error);
      expect(code).toBe('BAD_EMAIL');
      expect(message).toBe('כתובת האימייל אינה תקינה');
    }
  });

  it('reports a password the project considers weak, with its own words', () => {
    const { code, message } = toHebrewError(
      new AuthWeakPasswordError(
        'Password should contain at least one character of each: abcdefghijklmnopqrstuvwxyz, 0123456789.',
        422,
        ['characters'],
      ),
    );
    expect(code).toBe('WEAK_PASSWORD');
    expect(message).toContain('הסיסמה');
    expect(message).not.toBe(GENERIC_ERROR);
  });

  it('asks the person to wait when the project is rate limiting', () => {
    for (const error of [
      new AuthApiError(
        'For security purposes, you can only request this after 51 seconds.',
        429,
        'over_email_send_rate_limit',
      ),
      // Older projects answer 429 with no code at all.
      new AuthApiError('Request rate limit reached', 429, undefined),
    ]) {
      const { code, message } = toHebrewError(error);
      expect(code).toBe('TOO_MANY_ATTEMPTS');
      expect(message).toBe('בוצעו יותר מדי ניסיונות. נסו שוב בעוד מספר דקות');
    }
  });

  it('says so when registration is switched off for the project', () => {
    expect(
      toHebrewError(new AuthApiError('Signups not allowed for this instance', 422, 'signup_disabled')).code,
    ).toBe('SIGNUP_DISABLED');
    expect(
      toHebrewError(new AuthApiError('Email signups are disabled', 422, 'email_provider_disabled')).code,
    ).toBe('EMAIL_SIGNUP_DISABLED');
  });

  it('says so when a captcha is configured and the form has no token', () => {
    expect(
      toHebrewError(
        new AuthApiError('captcha protection: request disallowed (invalid-input-response)', 400, 'captcha_failed'),
      ).code,
    ).toBe('CAPTCHA_FAILED');
  });

  it('keeps the generic message for a server-side failure, but names it in the code', () => {
    // These are the two that a person cannot act on and must not be told the
    // internals of — while the log has to say which one happened.
    const trigger = toHebrewError(new AuthRetryableFetchError('Database error saving new user', 500));
    expect(trigger.code).toBe('SIGNUP_DB_ERROR');
    expect(trigger.message).toBe(GENERIC_ERROR);

    const email = toHebrewError(new AuthRetryableFetchError('Error sending confirmation email', 500));
    expect(email.code).toBe('EMAIL_SEND_FAILED');
    expect(email.message).toBe(GENERIC_ERROR);

    const other = toHebrewError(new AuthRetryableFetchError('Service Unavailable', 503));
    expect(other.code).toBe('AUTH_SERVER_ERROR');
    expect(other.message).toBe(GENERIC_ERROR);
  });

  it('tells the person when their device could not reach the service at all', () => {
    const { code, message } = toHebrewError(new AuthRetryableFetchError('fetch failed', 0));
    expect(code).toBe('NETWORK_ERROR');
    expect(message).toContain('חיבור');
  });

  it('leaks no English, no status code and no internals into any message', () => {
    const errors = [
      new AuthApiError('User already registered', 422, 'user_already_exists'),
      new AuthApiError('Signups not allowed for this instance', 422, 'signup_disabled'),
      new AuthRetryableFetchError('Database error saving new user', 500),
      new AuthRetryableFetchError('pq: duplicate key value violates unique constraint "users_email_key"', 500),
    ];
    for (const error of errors) {
      const { message } = toHebrewError(error);
      expect(message).not.toMatch(/[A-Za-z]{4,}/);
      expect(message).toMatch(/[֐-׿]/);
    }
  });
});

describe('signing in and resetting a password', () => {
  it('gives one answer for a wrong email and a wrong password', () => {
    expect(toHebrewError(new AuthApiError('Invalid login credentials', 400, 'invalid_credentials')).code).toBe(
      'BAD_CREDENTIALS',
    );
  });

  it('explains an unconfirmed address rather than blaming the password', () => {
    const { code, message } = toHebrewError(new AuthApiError('Email not confirmed', 400, 'email_not_confirmed'));
    expect(code).toBe('EMAIL_NOT_CONFIRMED');
    expect(message).toContain('לאשר');
  });

  it('explains an expired confirmation or reset link', () => {
    for (const code of ['otp_expired', 'flow_state_expired', 'bad_code_verifier']) {
      expect(toHebrewError(new AuthApiError('Token has expired or is invalid', 403, code)).code).toBe('LINK_EXPIRED');
    }
  });
});

describe('a field the browser let through', () => {
  // `type="email"` accepts an address with no dot in the domain, so the server
  // is where `ilan@gmail` is first refused. That refusal used to arrive as a
  // ZodError, whose message is a JSON dump nothing recognised.
  it('reports a rejected field as bad input, never as a server failure', () => {
    try {
      z.string().trim().email().parse('ilan@gmail');
      throw new Error('the schema should have refused this address');
    } catch (error) {
      const { code, message } = toHebrewError(error);
      expect(code).toBe('INVALID_INPUT');
      expect(message).not.toBe(GENERIC_ERROR);
    }
  });
});

describe('the rest of the app is unaffected', () => {
  it('still maps a Postgres machine code raised by an RPC', () => {
    expect(toHebrewError(new Error('NAME_TAKEN')).code).toBe('NAME_TAKEN');
    expect(toHebrewError(new Error('TABLE_CLOSED')).message).toBe(errorMessage('TABLE_CLOSED'));
    expect(toHebrewError(new Error('GUEST_CANNOT_FRIEND')).code).toBe('GUEST_CANNOT_FRIEND');
  });

  it('still reports a database that is behind the deployed code', () => {
    expect(toHebrewError({ code: 'PGRST202', message: 'Could not find the function' }).code).toBe(
      'SCHEMA_OUT_OF_DATE',
    );
  });

  it('still reports guest sign-in being turned off', () => {
    expect(
      toHebrewError(new AuthApiError('Anonymous sign-ins are disabled', 422, 'anonymous_provider_disabled')).code,
    ).toBe('ANONYMOUS_DISABLED');
    // And by its English wording, for a project on an older auth service.
    expect(toHebrewError(new Error('Anonymous sign-ins are disabled')).code).toBe('ANONYMOUS_DISABLED');
  });

  it('falls back to the generic message for something genuinely unknown', () => {
    const { code, message } = toHebrewError(new Error('something nobody has seen before'));
    expect(code).toBe('UNKNOWN');
    expect(message).toBe(GENERIC_ERROR);
  });

  it('ignores anything that is not an auth error', () => {
    expect(authErrorCode(new Error('NAME_TAKEN'))).toBeNull();
    expect(authErrorCode({ code: 'PGRST202', message: 'missing' })).toBeNull();
    expect(authErrorCode(null)).toBeNull();
    expect(authErrorCode('a string')).toBeNull();
  });
});
