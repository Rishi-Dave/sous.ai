import { render } from '@testing-library/react-native';
import { MicCard } from '../MicCard';

describe('MicCard', () => {
  it('renders the armed label "Tap or say \'hey sous\'" verbatim', () => {
    const { getByText } = render(<MicCard state="armed" />);
    // Copy is the single source of truth for the wake-word prompt; regression would
    // revert to the design spec's stale "hey chef" — lock it in.
    expect(getByText("Tap or say 'hey sous'")).toBeTruthy();
  });

  it('renders the Listening eyebrow + transcript when speaking', () => {
    const { getByText } = render(
      <MicCard state="listening" transcript="two cloves of garlic" />,
    );
    expect(getByText('Listening')).toBeTruthy();
    expect(getByText('two cloves of garlic')).toBeTruthy();
  });

  it('renders the Thinking label in processing state', () => {
    const { getByText } = render(<MicCard state="processing" />);
    expect(getByText('Thinking…')).toBeTruthy();
  });

  it('renders the chef-is-talking eyebrow + assistant text when speaking', () => {
    const { getByText } = render(
      <MicCard state="speaking" assistantText="How much olive oil?" />,
    );
    expect(getByText('Chef is talking')).toBeTruthy();
    expect(getByText('How much olive oil?')).toBeTruthy();
  });
});
