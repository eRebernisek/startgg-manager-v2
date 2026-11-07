import { Location } from '@angular/common';
import { Dialog } from '@angular/cdk/dialog';
import { Injectable, inject, signal } from '@angular/core';
import { NavigationCancel, NavigationEnd, NavigationError, NavigationStart, Router } from '@angular/router';
import { Capacitor } from '@capacitor/core';
import { AuthService } from './auth.service';
import { logicalParent, splitAppUrl } from './breadcrumbs';

/**
 * In-app back stack. Dialogs close first, then the previous screen, then the logical parent
 * when the screen was opened directly (no history yet). On Android the hardware back button
 * uses the same path and leaves the app only from home.
 */
@Injectable({ providedIn: 'root' })
export class AppNavigation {
  private readonly router = inject(Router);
  private readonly location = inject(Location);
  private readonly dialog = inject(Dialog);
  private readonly auth = inject(AuthService);

  private readonly stack: string[] = [];
  private readonly overlays: (() => boolean)[] = [];
  private sawNavigation = false;
  /** Flags from the NavigationStart that the matching NavigationEnd belongs to. */
  private incoming: { replaceUrl: boolean; pop: boolean } = { replaceUrl: false, pop: false };

  /** Header back button: there is a previous screen or a logical parent. */
  readonly canBack = signal(false);

  constructor() {
    if (this.router.navigated) {
      this.sawNavigation = true;
      this.stack.push(splitAppUrl(this.router.url).full);
    }
    this.router.events.subscribe((event) => {
      if (event instanceof NavigationStart) {
        const current = this.router.getCurrentNavigation();
        this.incoming = {
          // Popstate wins over replaceUrl. Angular reports browser back/forward with
          // extras.replaceUrl, and that must pop the stack instead of rewriting the top.
          replaceUrl: !!current?.extras.replaceUrl,
          pop: event.navigationTrigger === 'popstate' || event.navigationTrigger === 'hashchange',
        };
        return;
      }
      if (event instanceof NavigationCancel || event instanceof NavigationError) {
        this.incoming = { replaceUrl: false, pop: false };
        return;
      }
      if (event instanceof NavigationEnd) {
        const kind = this.incoming;
        this.incoming = { replaceUrl: false, pop: false };
        this.note(splitAppUrl(event.urlAfterRedirects).full, kind);
      }
    });
    this.refreshCanBack();
    this.listenForHardwareBack();
  }

  /** Top-most custom overlay (for example the character picker inside a dialog). */
  registerOverlay(close: () => boolean): () => void {
    this.overlays.push(close);
    return () => {
      const index = this.overlays.lastIndexOf(close);
      if (index >= 0) this.overlays.splice(index, 1);
    };
  }

  /**
   * Goes back one step. Returns false only on home with an empty stack, so the Android
   * listener can fall through to the system (leave the app).
   */
  goBack(): boolean {
    const overlay = this.overlays.at(-1);
    if (overlay?.()) return true;

    const top = this.dialog.openDialogs.at(-1);
    if (top) {
      top.close();
      return true;
    }

    if (this.stack.length > 1) {
      this.location.back();
      return true;
    }

    const current = this.stack.at(-1) ?? splitAppUrl(this.router.url).full;
    const parent = logicalParent(current, this.auth.hasToken());
    if (parent) {
      void this.router.navigateByUrl(parent, { replaceUrl: true });
      return true;
    }
    return false;
  }

  private note(url: string, kind: { replaceUrl: boolean; pop: boolean }): void {
    if (!this.sawNavigation) {
      this.sawNavigation = true;
      this.stack.splice(0, this.stack.length, url);
      this.refreshCanBack();
      return;
    }
    if (kind.pop) {
      this.reconcilePop(url);
      this.refreshCanBack();
      return;
    }
    // replaceUrl (bracket ?phase=&group=, logical parent) rewrites the current history
    // entry. A query-only change is the same screen even if the flag was missed.
    if (kind.replaceUrl || sameScreen(this.stack.at(-1), url)) {
      if (this.stack.length === 0) this.stack.push(url);
      else this.stack[this.stack.length - 1] = url;
      this.refreshCanBack();
      return;
    }
    this.stack.push(url);
    this.refreshCanBack();
  }

  /** Browser back/forward: trim to the entry that arrived, or adopt that URL if it is new. */
  private reconcilePop(url: string): void {
    const index = lastScreen(this.stack, url);
    if (index >= 0) {
      this.stack.splice(index + 1);
      this.stack[index] = url;
      return;
    }
    this.stack.splice(0, this.stack.length, url);
  }

  private refreshCanBack(): void {
    const current = this.stack.at(-1) ?? splitAppUrl(this.router.url).full;
    this.canBack.set(this.stack.length > 1 || logicalParent(current, this.auth.hasToken()) != null);
  }

  private listenForHardwareBack(): void {
    if (!Capacitor.isNativePlatform()) return;
    void import('@capacitor/app').then(({ App }) => {
      void App.addListener('backButton', () => {
        if (!this.goBack()) void App.exitApp();
      });
    });
  }
}

function sameScreen(a: string | undefined, b: string): boolean {
  return a != null && splitAppUrl(a).path === splitAppUrl(b).path;
}

function lastScreen(stack: readonly string[], url: string): number {
  for (let i = stack.length - 1; i >= 0; i--) {
    if (stack[i] === url || sameScreen(stack[i], url)) return i;
  }
  return -1;
}
