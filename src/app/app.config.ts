import {
  ApplicationConfig,
  inject,
  provideAppInitializer,
  provideBrowserGlobalErrorListeners,
} from '@angular/core';
import { provideRouter, withComponentInputBinding, withHashLocation } from '@angular/router';
import { DialogModule } from '@angular/cdk/dialog';
import { importProvidersFrom } from '@angular/core';
import { routes } from './app.routes';
import { AuthService } from './core/auth.service';
import { ToastService } from './core/toast.service';
import { WebSessionService } from './core/web-session.service';
import { Router } from '@angular/router';

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    importProvidersFrom(DialogModule),
    // Hash routing works on any static host and inside the Capacitor WebView without rewrites.
    provideRouter(routes, withComponentInputBinding(), withHashLocation()),
    provideAppInitializer(() => inject(AuthService).load()),
    provideAppInitializer(() => inject(WebSessionService).load()),
    provideAppInitializer(() => {
      const auth = inject(AuthService);
      const toast = inject(ToastService);
      const router = inject(Router);
      auth.authError$.subscribe((msg) => {
        toast.error(msg);
        void router.navigateByUrl('/settings');
      });
    }),
  ],
};
