import { en } from './en';
import { translateRoundName } from './round-names';

const tEn = (key: keyof typeof en) => en[key];

describe('translateRoundName', () => {
  it('maps known start.gg labels and leaves unknowns alone', () => {
    expect(translateRoundName('Grand Final Reset', tEn)).toBe('Grand Final Reset');
    expect(translateRoundName('Winners Semi-Final', tEn)).toBe('Winners Semi-Final');
    expect(translateRoundName('Custom Pool Final', tEn)).toBe('Custom Pool Final');
  });

  it('maps Round N and Top N variants', () => {
    expect(translateRoundName('Winners Round 2', tEn)).toBe('Winners Round 2');
    expect(translateRoundName('Losers Round 1', tEn)).toBe('Losers Round 1');
    expect(translateRoundName('Round 3', tEn)).toBe('Round 3');
    expect(translateRoundName('Winners Top 8', tEn)).toBe('Winners Top 8');
    expect(translateRoundName('Losers Top 16', tEn)).toBe('Losers Top 16');
    expect(translateRoundName('Top 8', tEn)).toBe('Top 8');
  });
});
