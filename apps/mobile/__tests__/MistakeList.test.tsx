import React from 'react';
import { Text } from 'react-native';
import ReactTestRenderer from 'react-test-renderer';
import { MistakeList } from '../src/components/primitives';

test('renders pronunciation evidence details', () => {
  let renderer: ReactTestRenderer.ReactTestRenderer | undefined;

  ReactTestRenderer.act(() => {
    renderer = ReactTestRenderer.create(
      <MistakeList
        mistakes={[
          {
            original: '/v/ sounded like /w/',
            correction: 'Use /v/ instead of /w/',
            reason: 'Pronunciation assessment found low-scoring /v/ sounds.',
            category: 'pronunciation',
            count: 2,
            source: 'pronunciation',
            evidence: {
              expected_sound: 'v',
              heard_sound: 'w',
              score: 40,
              example_words: ['very', 'vivid'],
            },
          },
        ]}
        emptyTitle="No mistakes"
        emptyText="No mistakes found."
      />,
    );
  });

  const text = renderer!
    .root.findAllByType(Text)
    .map(node => node.props.children)
    .flat(Infinity)
    .join(' ');

  expect(text).toContain('/v/ heard as /w/');
  expect(text).toContain('score 40/100');
  expect(text).toContain('examples: very, vivid');
});
