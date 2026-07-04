/**
 * @format
 */

import React from 'react';
import ReactTestRenderer from 'react-test-renderer';
import App from '../App';

jest.mock('react-native-audio-recorder-player', () => ({
  __esModule: true,
  default: {
    addRecordBackListener: jest.fn(),
    removeRecordBackListener: jest.fn(),
    startRecorder: jest.fn(),
    stopRecorder: jest.fn(),
  },
}));

beforeEach(() => {
  globalThis.fetch = jest.fn((input: RequestInfo | URL) => {
    const url = String(input);

    return Promise.resolve({
      ok: true,
      json: () =>
        Promise.resolve(
          url.includes('/api/sessions')
            ? { sessions: [] }
            : url.includes('/api/voice-profile')
            ? { enrolled: false }
            : {
                date: '2026-07-04',
                generated_at: '2026-07-04T20:00:00Z',
                session_count: 0,
                recording_seconds: 0,
                transcript_minutes: 0,
                top_mistakes: [],
                summary:
                  'No conversations have been analyzed for this day yet.',
              },
        ),
    });
  }) as jest.Mock;
});

test('renders correctly', async () => {
  await ReactTestRenderer.act(() => {
    ReactTestRenderer.create(<App />);
  });
});
