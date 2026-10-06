import { parseBracketUrl, shortSlug } from './bracket-url';

describe('parseBracketUrl', () => {
  it('parses a full bracket URL', () => {
    expect(
      parseBracketUrl('https://www.start.gg/tournament/many-api-test/event/teste-rivals-2/brackets/2173645/3162844'),
    ).toEqual({
      tournamentSlug: 'many-api-test',
      eventSlug: 'teste-rivals-2',
      phaseId: '2173645',
      phaseGroupId: '3162844',
    });
  });

  it('parses event URLs without a bracket', () => {
    expect(parseBracketUrl('start.gg/tournament/genesis-9-1/event/melee-singles/overview')).toEqual({
      tournamentSlug: 'genesis-9-1',
      eventSlug: 'melee-singles',
    });
  });

  it('parses phase-only bracket URLs and legacy smash.gg', () => {
    expect(parseBracketUrl('https://smash.gg/tournament/x/event/y/brackets/123')).toEqual({
      tournamentSlug: 'x',
      eventSlug: 'y',
      phaseId: '123',
    });
  });

  it('parses admin and tournament-only URLs', () => {
    expect(parseBracketUrl('https://www.start.gg/admin/tournament/my-t/brackets')).toEqual({
      tournamentSlug: 'my-t',
    });
    expect(parseBracketUrl('tournament/my-t/details')).toEqual({ tournamentSlug: 'my-t' });
  });

  it('strips query strings, trailing slashes, and surrounding whitespace', () => {
    expect(
      parseBracketUrl('  https://start.gg/tournament/t/event/e/brackets/1/2/?foo=1  '),
    ).toEqual({
      tournamentSlug: 't',
      eventSlug: 'e',
      phaseId: '1',
      phaseGroupId: '2',
    });
  });

  it('rejects unrelated input', () => {
    expect(parseBracketUrl('')).toBeNull();
    expect(parseBracketUrl('https://example.com/foo')).toBeNull();
  });

  it('shortSlug strips the tournament/ prefix', () => {
    expect(shortSlug('tournament/many-api-test')).toBe('many-api-test');
    expect(shortSlug('many-api-test')).toBe('many-api-test');
  });
});
