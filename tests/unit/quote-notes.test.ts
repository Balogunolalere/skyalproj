/**
 * The engine's explanation of a price must reach the customer.
 *
 * It was silently dropped: the breakdown typed `notes` as a string while the API
 * returns an array, so nothing read it. A minimum-charge order then showed a
 * ₦20,000 total against ₦10,000 of lines with no reason given — which looks like
 * a broken calculation and is exactly what it is not.
 */
import { describe, it, expect } from 'vitest';
import { noteList } from '@/lib/quote-notes';

describe('noteList', () => {
  it('passes the engine\'s notes through, in order', () => {
    expect(noteList(['Minimum charge of ₦20,000 applied.', 'No material charge — service only.']))
      .toEqual(['Minimum charge of ₦20,000 applied.', 'No material charge — service only.']);
  });

  it('accepts a single string, so an odd payload cannot blank the panel', () => {
    expect(noteList('Minimum charge applied.')).toEqual(['Minimum charge applied.']);
  });

  it('returns nothing for missing notes rather than a stray bullet', () => {
    expect(noteList(undefined)).toEqual([]);
    expect(noteList(null)).toEqual([]);
    expect(noteList([])).toEqual([]);
    expect(noteList('')).toEqual([]);
  });

  it('drops blanks AND whitespace-only notes, so no empty bullet renders', () => {
    expect(noteList(['Real note', '', '   ', 'Another'])).toEqual(['Real note', 'Another']);
  });

  it('trims each note', () => {
    expect(noteList(['  padded  '])).toEqual(['padded']);
  });

  it('never returns a non-string', () => {
    // @ts-expect-error deliberately wrong input from an unknown payload
    expect(noteList([1, null, 'ok'])).toEqual(['1', 'ok']);
  });
});
