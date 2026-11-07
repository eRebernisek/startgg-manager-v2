import { breadcrumbTrail, eventCrumbKey, humanizeSlug, logicalParent, tournamentCrumbKey } from './breadcrumbs';

describe('logicalParent', () => {
  it('walks event → tournament → tournament list → home when a token is set', () => {
    expect(logicalParent('/tournament/cup/event/melee/sets?phase=1', true)).toBe('/tournament/cup');
    expect(logicalParent('/tournament/cup/event/melee/bracket', true)).toBe('/tournament/cup');
    expect(logicalParent('/tournament/cup', true)).toBe('/tournaments');
    expect(logicalParent('/tournaments', true)).toBe('/');
    expect(logicalParent('/settings', true)).toBe('/');
    expect(logicalParent('/', true)).toBeNull();
  });

  it('skips the tournament list when there is no token', () => {
    expect(logicalParent('/tournament/cup/event/melee/entrants', false)).toBe('/tournament/cup');
    expect(logicalParent('/tournament/cup', false)).toBe('/');
  });
});

describe('breadcrumbTrail', () => {
  const labels = {
    [tournamentCrumbKey('cup')]: 'Battle Coliseum',
    [eventCrumbKey('cup', 'melee-singles')]: 'Melee Singles',
  };

  it('names every route and points parent crumbs at the right url', () => {
    expect(breadcrumbTrail('/', {}, false)).toEqual([{ label: 'Home' }]);
    expect(breadcrumbTrail('/settings', {}, true)).toEqual([
      { label: 'Home', url: '/' },
      { label: 'Settings' },
    ]);
    expect(breadcrumbTrail('/tournaments', {}, true)).toEqual([
      { label: 'Home', url: '/' },
      { label: 'My tournaments' },
    ]);
    expect(breadcrumbTrail('/tournament/cup', labels, true)).toEqual([
      { label: 'Home', url: '/' },
      { label: 'My tournaments', url: '/tournaments' },
      { label: 'Battle Coliseum' },
    ]);
    expect(breadcrumbTrail('/tournament/cup', {}, false)).toEqual([
      { label: 'Home', url: '/' },
      { label: 'Cup' },
    ]);

    for (const section of ['bracket', 'sets', 'entrants', 'seeding'] as const) {
      const trail = breadcrumbTrail(`/tournament/cup/event/melee-singles/${section}?phase=3`, labels, true);
      expect(trail.map((c) => c.label)).toEqual([
        'Home',
        'My tournaments',
        'Battle Coliseum',
        'Melee Singles',
        section === 'bracket'
          ? 'Bracket'
          : section === 'sets'
            ? 'Sets'
            : section === 'entrants'
              ? 'Entrants'
              : 'Seeding',
      ]);
      expect(trail[0]?.url).toBe('/');
      expect(trail[1]?.url).toBe('/tournaments');
      expect(trail[2]?.url).toBe('/tournament/cup');
      expect(trail[3]?.url).toBe('/tournament/cup/event/melee-singles/bracket');
      expect(trail[4]?.url).toBeUndefined();
    }
  });

  it('uses the slug on a direct URL until the real title arrives, and omits the list without a token', () => {
    expect(humanizeSlug('melee-singles')).toBe('Melee Singles');
    expect(breadcrumbTrail('/tournament/battle-coliseum/event/rivals-2/seeding', {}, false).map((c) => c.label)).toEqual(
      ['Home', 'Battle Coliseum', 'Rivals 2', 'Seeding'],
    );
  });
});
