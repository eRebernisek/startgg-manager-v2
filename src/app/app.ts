import { CdkMenu, CdkMenuItem, CdkMenuTrigger } from '@angular/cdk/menu';
import { ChangeDetectionStrategy, Component, DestroyRef, ViewChild, inject } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { NavigationEnd, Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { filter } from 'rxjs';
import { AppNavigation } from './core/app-navigation';
import { AuthService } from './core/auth.service';
import { BreadcrumbService } from './core/breadcrumbs';
import { AppLang, I18nService } from './core/i18n/i18n.service';
import { TPipe } from './core/i18n/t.pipe';
import { ToastService } from './core/toast.service';

@Component({
  selector: 'app-root',
  imports: [RouterOutlet, RouterLink, RouterLinkActive, TPipe, CdkMenu, CdkMenuItem, CdkMenuTrigger],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './app.html',
  styleUrl: './app.scss',
})
export class App {
  protected readonly auth = inject(AuthService);
  protected readonly toast = inject(ToastService);
  protected readonly navigation = inject(AppNavigation);
  protected readonly breadcrumbs = inject(BreadcrumbService);
  protected readonly i18n = inject(I18nService);

  @ViewChild(CdkMenuTrigger) private readonly langMenuTrigger?: CdkMenuTrigger;

  constructor() {
    const destroyRef = inject(DestroyRef);
    inject(Router)
      .events.pipe(
        filter((event): event is NavigationEnd => event instanceof NavigationEnd),
        takeUntilDestroyed(destroyRef),
      )
      .subscribe(() => this.langMenuTrigger?.close());
  }

  protected setLang(lang: AppLang): void {
    void this.i18n.setLang(lang);
  }
}
