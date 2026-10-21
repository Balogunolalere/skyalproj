/**
 * Which free-text field gets told "case sensitive".
 *
 * The hint used to render under EVERY text field, so an age, or a placement note
 * like "lying flat on the cake", told the customer their wording would be cut
 * into the topper. Only the printed message is.
 *
 * The predicate reads the KEY *or* the LABEL on purpose: the key is authored
 * freely in the admin (the repo's own fixtures include
 * `{ key: 'msg', label: 'Message' }`), so a key-only rule would silently drop the
 * warning from a service that named its field anything else.
 */
import { describe, it, expect } from 'vitest';
import { isVerbatimTextField } from '@/lib/order';

const f = (key: string, label = '') => ({ key, label });

describe('isVerbatimTextField', () => {
  it('is true for the message the customer wants cut', () => {
    expect(isVerbatimTextField(f('message', 'Topper Message'))).toBe(true);
    expect(isVerbatimTextField(f('Message'))).toBe(true);
    expect(isVerbatimTextField(f('  MESSAGE  '))).toBe(true);
    expect(isVerbatimTextField(f('topper_message'))).toBe(true);
  });

  it('is true when only the LABEL says it is a message', () => {
    // A service may key its field anything; the label is what the owner typed.
    expect(isVerbatimTextField(f('msg', 'Message'))).toBe(true);
    expect(isVerbatimTextField(f('text_1', 'Topper wording'))).toBe(true);
  });

  it('is false for the notes that are instructions, not artwork', () => {
    expect(isVerbatimTextField(f('Age', 'Age'))).toBe(false);
    expect(isVerbatimTextField(f('Placement', 'Where on the cake should it go?'))).toBe(false);
    expect(isVerbatimTextField(f('customerNotes', 'Notes'))).toBe(false);
    expect(isVerbatimTextField(f('notes'))).toBe(false);
  });

  it('does not match a key that merely contains the word', () => {
    expect(isVerbatimTextField(f('messageHistory'))).toBe(false);
  });

  it('is false rather than throwing for a missing field', () => {
    expect(isVerbatimTextField({})).toBe(false);
    expect(isVerbatimTextField({ key: null, label: null })).toBe(false);
    expect(isVerbatimTextField({ key: '' })).toBe(false);
  });
});
