import { Location } from '@angular/common';
import { provideLocationMocks, SpyLocation } from '@angular/common/testing';
import { Dialog } from '@angular/cdk/dialog';
import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { NavigationEnd, provideRouter, Router } from '@angular/router';
import { AppNavigation } from './app-navigation';
import { AuthService } from './auth.service';

@Component({ template: '' })
class Blank {}

describe('AppNavigation', () => {
  let dialog: { openDialogs: { close: ReturnType<typeof vi.fn> }[] };

  function setup(): { nav: AppNavigation; router: Router; location: Location } {
    const router = TestBed.inject(Router);
    return { nav: TestBed.inject(AppNavigation), router, location: TestBed.inject(Location) };
  }

  function configure(hasToken = true): void {
    dialog = { openDialogs: [] };
    TestBed.configureTestingModule({
      providers: [
        provideRouter([
          { path: '', component: Blank },
          { path: 'settings', component: Blank },
          { path: 'tournaments', component: Blank },
          { path: 'tournament/:tournament', component: Blank },
          {
            path: 'tournament/:tournament/event/:event',
            children: [
              { path: '', pathMatch: 'full', redirectTo: 'bracket' },
              { path: 'bracket', component: Blank },
              { path: 'sets', component: Blank },
            ],
          },
        ]),
        provideLocationMocks(),
        { provide: Dialog, useValue: dialog },
        { provide: AuthService, useValue: { hasToken: () => hasToken } },
      ],
    });
  }

  afterEach(() => TestBed.resetTestingModule());

  it('closes the top dialog before leaving the page', async () => {
    configure();
    const { nav, router } = setup();
    await router.navigateByUrl('/settings');
    const close = vi.fn();
    dialog.openDialogs.push({ close });
    const back = vi.spyOn(TestBed.inject(Location), 'back');
    expect(nav.goBack()).toBe(true);
    expect(close).toHaveBeenCalledTimes(1);
    expect(back).not.toHaveBeenCalled();
  });

  it('closes a registered overlay before the dialog behind it', async () => {
    configure();
    const { nav, router } = setup();
    await router.navigateByUrl('/settings');
    const closeDialog = vi.fn();
    dialog.openDialogs.push({ close: closeDialog });
    let pickerOpen = true;
    const unregister = nav.registerOverlay(() => {
      pickerOpen = false;
      return true;
    });
    expect(nav.goBack()).toBe(true);
    expect(pickerOpen).toBe(false);
    expect(closeDialog).not.toHaveBeenCalled();
    unregister();
    expect(nav.goBack()).toBe(true);
    expect(closeDialog).toHaveBeenCalledTimes(1);
  });

  it('returns through in-app history', async () => {
    configure();
    const { nav, router, location } = setup();
    await router.navigateByUrl('/');
    await router.navigateByUrl('/settings');
    const back = vi.spyOn(location, 'back');
    expect(nav.canBack()).toBe(true);
    expect(nav.goBack()).toBe(true);
    expect(back).toHaveBeenCalledTimes(1);
  });

  it('uses the logical parent when the screen was opened directly', async () => {
    configure();
    const router = TestBed.inject(Router);
    await router.navigateByUrl('/tournament/cup/event/melee/sets');
    const nav = TestBed.inject(AppNavigation);
    const navigate = vi.spyOn(router, 'navigateByUrl');
    expect(nav.canBack()).toBe(true);
    expect(nav.goBack()).toBe(true);
    expect(navigate).toHaveBeenCalledWith('/tournament/cup', { replaceUrl: true });
    await navigate.mock.results[0]?.value;
    expect(nav.goBack()).toBe(true);
    expect(navigate).toHaveBeenCalledWith('/tournaments', { replaceUrl: true });
  });

  it('does not leave home when there is no history', async () => {
    configure();
    const { nav, router } = setup();
    await router.navigateByUrl('/');
    expect(nav.canBack()).toBe(false);
    expect(nav.goBack()).toBe(false);
  });

  it('treats a bracket query replaceUrl as the same screen, then backs to the tournament and home', async () => {
    configure(false);
    const router = TestBed.inject(Router);
    await router.navigateByUrl('/tournament/genesis-9-1');
    router.initialNavigation();
    const nav = TestBed.inject(AppNavigation);
    await router.navigateByUrl('/tournament/genesis-9-1/event/melee/bracket');
    await router.navigateByUrl('/tournament/genesis-9-1/event/melee/bracket?phase=1&group=2', {
      replaceUrl: true,
    });

    const popped = navigationEnd(router);
    expect(nav.goBack()).toBe(true);
    expect((await popped).split('?')[0]).toBe('/tournament/genesis-9-1');
    expect(nav.canBack()).toBe(true);

    const navigate = vi.spyOn(router, 'navigateByUrl');
    expect(nav.goBack()).toBe(true);
    expect(navigate).toHaveBeenCalledWith('/', { replaceUrl: true });
    await navigate.mock.results[0]?.value;
    expect(router.url.split('?')[0]).toBe('/');
    expect(nav.canBack()).toBe(false);
    expect(nav.goBack()).toBe(false);
  });

  it('does not grow history when the bracket breadcrumb drops the query and the page writes it back', async () => {
    configure(false);
    const router = TestBed.inject(Router);
    await router.navigateByUrl('/tournament/genesis-9-1');
    router.initialNavigation();
    const nav = TestBed.inject(AppNavigation);
    const bracket = '/tournament/genesis-9-1/event/melee/bracket';
    await router.navigateByUrl(bracket);
    await router.navigateByUrl(`${bracket}?phase=1&group=2`, { replaceUrl: true });
    await router.navigateByUrl(bracket, { replaceUrl: true });
    await router.navigateByUrl(`${bracket}?phase=1&group=2`, { replaceUrl: true });

    const popped = navigationEnd(router);
    expect(nav.goBack()).toBe(true);
    expect((await popped).split('?')[0]).toBe('/tournament/genesis-9-1');
  });

  it('adopts an unexpected popstate and does not ignore the next back', async () => {
    configure(false);
    const router = TestBed.inject(Router);
    await router.navigateByUrl('/tournament/cup/event/melee/bracket?phase=1&group=2');
    router.initialNavigation();
    const nav = TestBed.inject(AppNavigation);
    const location = TestBed.inject(Location) as SpyLocation;

    const landed = navigationEnd(router);
    location.simulateUrlPop('/settings');
    expect((await landed).split('?')[0]).toBe('/settings');
    expect(nav.canBack()).toBe(true);

    const navigate = vi.spyOn(router, 'navigateByUrl');
    expect(nav.goBack()).toBe(true);
    expect(navigate).toHaveBeenCalledWith('/', { replaceUrl: true });
  });

  it('hides back when popstate lands on home, instead of returning to an older page', async () => {
    configure(false);
    const router = TestBed.inject(Router);
    await router.navigateByUrl('/settings');
    router.initialNavigation();
    const nav = TestBed.inject(AppNavigation);
    await router.navigateByUrl('/tournament/cup');
    const location = TestBed.inject(Location) as SpyLocation;

    const landed = navigationEnd(router);
    location.simulateUrlPop('/');
    await landed;
    expect(router.url.split('?')[0]).toBe('/');
    expect(nav.canBack()).toBe(false);
    expect(nav.goBack()).toBe(false);
  });
});

function navigationEnd(router: Router): Promise<string> {
  const seen: string[] = [];
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      sub.unsubscribe();
      reject(new Error(`timed out at ${router.url}; events: ${seen.join(' | ')}`));
    }, 1000);
    const sub = router.events.subscribe((event) => {
      seen.push(event.constructor.name);
      if (event instanceof NavigationEnd) {
        clearTimeout(timer);
        sub.unsubscribe();
        resolve(event.urlAfterRedirects);
      }
    });
  });
}
