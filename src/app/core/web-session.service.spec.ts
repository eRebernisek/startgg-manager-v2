import { normalizeSession } from './web-session.service';

describe('normalizeSession', () => {
  it('accepts the bare value, name=value, or a pasted Cookie header', () => {
    expect(normalizeSession('  abc123.def  ')).toBe('abc123.def');
    expect(normalizeSession('gg_session=abc123')).toBe('abc123');
    expect(normalizeSession('Cookie: foo=1; gg_session=abc123; bar=2')).toBe('abc123');
  });

  it('rejects other cookies and empty input', () => {
    expect(normalizeSession('foo=1; bar=2')).toBeNull();
    expect(normalizeSession('two words')).toBeNull();
    expect(normalizeSession('')).toBeNull();
    expect(normalizeSession(null)).toBeNull();
  });
});
