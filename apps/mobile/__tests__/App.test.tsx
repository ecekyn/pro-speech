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

jest.mock('react-native-safe-area-context', () => {
  const ReactRuntime = require('react');
  const { View } = require('react-native');

  return {
    SafeAreaProvider: ({ children }: { children: React.ReactNode }) =>
      ReactRuntime.createElement(View, null, children),
    initialWindowMetrics: null,
    useSafeAreaInsets: () => ({ bottom: 0, left: 0, right: 0, top: 0 }),
  };
});

const mountedRenderers: Array<ReturnType<typeof ReactTestRenderer.create>> = [];

beforeEach(() => {
  mockApiVoiceProfile({ enrolled: false });
});

afterEach(() => {
  mountedRenderers.forEach(renderer => {
    ReactTestRenderer.act(() => {
      renderer.unmount();
    });
  });
  mountedRenderers.length = 0;
});

test('shows onboarding when no voice profile exists', async () => {
  const renderer = await renderApp();

  expect(
    renderer.root.findByProps({ children: 'Set up voice filtering' }),
  ).toBeTruthy();
});

test('shows recording dashboard when voice profile exists', async () => {
  mockApiVoiceProfile({ enrolled: true, sample_count: 1 });

  const renderer = await renderApp();

  expect(
    renderer.root.findAllByProps({ children: 'Record' }).length,
  ).toBeGreaterThan(0);
});

async function renderApp() {
  let renderer: ReturnType<typeof ReactTestRenderer.create> | undefined;

  await ReactTestRenderer.act(async () => {
    renderer = ReactTestRenderer.create(<App />);
    mountedRenderers.push(renderer);
  });

  await ReactTestRenderer.act(async () => {
    await Promise.resolve();
    await Promise.resolve();
    await new Promise(resolve => setTimeout(resolve, 0));
  });

  return renderer!;
}

function mockApiVoiceProfile(voiceProfile: Record<string, unknown>) {
  globalThis.fetch = jest.fn((input: RequestInfo | URL) => {
    const url = String(input);

    return Promise.resolve({
      ok: true,
      json: () =>
        Promise.resolve(
          url.includes('/api/sessions')
            ? { sessions: [] }
            : url.includes('/api/voice-profile')
            ? voiceProfile
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
}
