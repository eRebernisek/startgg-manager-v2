import { Dialog, DIALOG_DATA, DialogRef } from '@angular/cdk/dialog';
import { ChangeDetectionStrategy, Component, Injector, OnInit, computed, inject, signal } from '@angular/core';
import { Id } from '../../core/api/models';
import { PlayerProfile, StartggApi } from '../../core/api/startgg-api.service';
import { AvatarComponent } from '../../shared/avatar.component';
import { errorMessage, profileImage } from '../../shared/display';

export function openPlayerDialog(dialog: Dialog, injector: Injector, playerId: Id) {
  return dialog.open(PlayerDialog, {
    data: playerId,
    injector,
    panelClass: 'app-dialog-panel',
    backdropClass: ['cdk-overlay-backdrop', 'app-dialog-backdrop'],
  });
}

@Component({
  selector: 'app-player-dialog',
  imports: [AvatarComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="dialog">
      @if (banner()) {
        <img class="banner" [src]="banner()" alt="" referrerpolicy="no-referrer" />
      }
      <header>
        @if (player(); as p) {
          <app-avatar [src]="avatar()" [name]="p.gamerTag" [size]="56" />
          <div class="spacer">
            <h2 style="margin: 0">
              @if (p.prefix) {
                <span class="muted">{{ p.prefix }}</span>
              }
              {{ p.gamerTag }}
            </h2>
            <div class="muted small">
              {{ p.user?.name }}
              @if (p.user?.genderPronoun) {
                · {{ p.user?.genderPronoun }}
              }
            </div>
          </div>
        } @else {
          <span class="spacer"></span>
        }
        <button class="ghost" (click)="ref.close()" aria-label="Close">✕</button>
      </header>
      <div class="body stack">
        @if (loading()) {
          <div class="spinner"></div>
        }
        @if (error()) {
          <div class="alert error">{{ error() }}</div>
        }
        @if (player(); as p) {
          @if (location()) {
            <div>📍 {{ location() }}</div>
          }
          @for (a of p.user?.authorizations ?? []; track a.type) {
            @if (a.externalUsername) {
              <div class="small"><span class="badge">{{ a.type }}</span> {{ a.externalUsername }}</div>
            }
          }
          @if (p.recentStandings?.length) {
            <h3>Recent results</h3>
            <div class="card" style="padding: 0">
              @for (s of p.recentStandings; track $index) {
                <div class="list-item small">
                  <strong style="width: 2.5rem">#{{ s.placement }}</strong>
                  <span class="spacer">
                    {{ s.container?.tournament?.name }} — {{ s.container?.name }}
                    <span class="muted">({{ s.container?.numEntrants }})</span>
                  </span>
                </div>
              }
            </div>
          }
          @if (p.user?.slug) {
            <a class="btn" [href]="'https://www.start.gg/' + p.user?.slug" target="_blank" rel="noopener">
              start.gg profile ↗
            </a>
          }
        }
      </div>
    </div>
  `,
  styles: `
    .banner {
      width: 100%;
      height: 110px;
      object-fit: cover;
    }
  `,
})
export class PlayerDialog implements OnInit {
  private readonly api = inject(StartggApi);
  protected readonly ref = inject(DialogRef);
  private readonly playerId = inject<Id>(DIALOG_DATA);

  protected readonly player = signal<PlayerProfile | null>(null);
  protected readonly loading = signal(true);
  protected readonly error = signal<string | null>(null);

  protected readonly avatar = computed(() => profileImage(this.player()?.user?.images));
  protected readonly banner = computed(
    () => this.player()?.user?.images?.find((i) => i.type === 'banner')?.url ?? null,
  );
  protected readonly location = computed(() => {
    const l = this.player()?.user?.location;
    return [l?.city, l?.state, l?.country].filter(Boolean).join(', ');
  });

  async ngOnInit(): Promise<void> {
    try {
      this.player.set(await this.api.player(this.playerId));
    } catch (e) {
      this.error.set(errorMessage(e));
    } finally {
      this.loading.set(false);
    }
  }
}
