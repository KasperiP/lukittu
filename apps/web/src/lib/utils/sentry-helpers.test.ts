import type { ErrorEvent } from '@sentry/nextjs';
import { isThirdPartyScriptError } from './sentry-helpers';

const eventWithFrames = (filenames: (string | undefined)[]): ErrorEvent =>
  ({
    type: undefined,
    exception: {
      values: [
        {
          type: 'TypeError',
          value: "Cannot read properties of undefined (reading 'M_ID')",
          stacktrace: {
            frames: filenames.map((filename) => ({ filename })),
          },
        },
      ],
    },
  }) as ErrorEvent;

describe('isThirdPartyScriptError', () => {
  it('detects errors thrown only from injected executor scripts', () => {
    expect(
      isThirdPartyScriptError(
        eventWithFrames(['app:///executors/200.js', 'app:///executors/200.js']),
      ),
    ).toBe(true);
  });

  it('detects errors thrown only from browser extensions', () => {
    expect(
      isThirdPartyScriptError(
        eventWithFrames(['chrome-extension://abcdef/content.js']),
      ),
    ).toBe(true);
  });

  it('keeps errors thrown from application chunks', () => {
    expect(
      isThirdPartyScriptError(
        eventWithFrames([
          'app:///_next/static/chunks/app/dashboard/page.js',
          'app:///executors/200.js',
        ]),
      ),
    ).toBe(false);
  });

  it('keeps errors without stack frames', () => {
    expect(isThirdPartyScriptError(eventWithFrames([]))).toBe(false);
    expect(isThirdPartyScriptError({ type: undefined } as ErrorEvent)).toBe(
      false,
    );
  });
});
