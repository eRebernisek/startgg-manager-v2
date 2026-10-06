import { inject } from '@angular/core';
import { Router, Routes } from '@angular/router';
import { AuthService } from './core/auth.service';

const requireToken = () => inject(AuthService).hasToken() || inject(Router).parseUrl('/settings');

export const routes: Routes = [
  { path: '', loadComponent: () => import('./features/home/home.page').then((m) => m.HomePage) },
  {
    path: 'settings',
    loadComponent: () => import('./features/settings/settings.page').then((m) => m.SettingsPage),
  },
  {
    path: 'tournaments',
    canActivate: [requireToken],
    loadComponent: () =>
      import('./features/tournaments/tournaments.page').then((m) => m.TournamentsPage),
  },
  {
    path: 'tournament/:tournament',
    loadComponent: () =>
      import('./features/tournaments/tournament.page').then((m) => m.TournamentPage),
  },
  {
    // Mirrors start.gg URLs so a pasted bracket URL maps 1:1 onto app routes.
    path: 'tournament/:tournament/event/:event',
    loadComponent: () => import('./features/event/event.page').then((m) => m.EventPage),
    children: [
      { path: '', pathMatch: 'full', redirectTo: 'bracket' },
      {
        path: 'bracket',
        loadComponent: () => import('./features/bracket/bracket.page').then((m) => m.BracketPage),
      },
      {
        path: 'sets',
        loadComponent: () => import('./features/sets/sets.page').then((m) => m.SetsPage),
      },
      {
        path: 'entrants',
        loadComponent: () =>
          import('./features/entrants/entrants.page').then((m) => m.EntrantsPage),
      },
      {
        path: 'seeding',
        loadComponent: () => import('./features/seeding/seeding.page').then((m) => m.SeedingPage),
      },
    ],
  },
  { path: '**', redirectTo: '' },
];
