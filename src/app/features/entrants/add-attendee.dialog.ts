import { DIALOG_DATA, Dialog, DialogRef } from '@angular/cdk/dialog';
import { ChangeDetectionStrategy, Component, Injector, OnDestroy, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { AttendeesApi, PlayerHit } from '../../core/api/attendees-api.service';
import { MAX_GAMER_TAG, MAX_PREFIX, NewAttendee, parseUserSlug, validateTag } from '../../core/attendees';
import { startggAdminUrl } from '../../core/bracket-url';
import { AvatarComponent } from '../../shared/avatar.component';
import { errorMessage, profileImage } from '../../shared/display';
import { AddAttendeeData, AddAttendeeResult, attendeeLabel, dialogConfig } from './attendee-dialogs';

const SEARCH_DEBOUNCE_MS = 300;

export function openAddAttendee(dialog: Dialog, injector: Injector, data: AddAttendeeData) {
  return dialog.open<AddAttendeeResult, AddAttendeeData>(AddAttendeeDialog, { ...dialogConfig, injector, data });
}

@Component({
  selector: 'app-add-attendee-dialog',
  imports: [FormsModule, RouterLink, AvatarComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styleUrl: './attendees.scss',
  template: `
    <form class="dialog attendee-dialog" (ngSubmit)="submit()" aria-labelledby="add-title">
      <header>
        <strong id="add-title" class="spacer">Add attendee</strong>
        <button type="button" class="ghost" (click)="ref.close()" aria-label="Close">✕</button>
      </header>

      <div class="body stack">
        <p class="muted small">
          Registers the player for <strong>{{ data.tournamentName }}</strong> and adds them to
          <strong>{{ data.eventName }}</strong>.
        </p>

        @if (data.blockedReason) {
          <div class="alert warn small stack">
            <span>{{ data.blockedReason }}</span>
            <span class="row">
              <a class="btn sm" routerLink="/settings" (click)="ref.close()">Open Settings</a>
              <a class="btn sm" [href]="attendeesUrl" target="_blank" rel="noopener">Add on start.gg ↗</a>
            </span>
          </div>
        }

        @if (mode() === 'search') {
          <div class="search-box">
            <label class="floating" for="player-search">Search for a player</label>
            <span class="search-icon" aria-hidden="true">⌕</span>
            <input
              id="player-search"
              name="search"
              autocomplete="off"
              placeholder="Search"
              [ngModel]="query()"
              (ngModelChange)="onQuery($event)"
              role="combobox"
              aria-controls="player-results"
              [attr.aria-expanded]="true"
            />
          </div>
          <div class="results" id="player-results" role="listbox" aria-label="Players">
            @if (!query().trim()) {
              <div class="hint">Search by gamertag, name, or start.gg profile URL</div>
            } @else if (searching()) {
              <div class="hint"><span class="spinner sm"></span> Searching…</div>
            } @else if (searchError()) {
              <div class="hint error">{{ searchError() }}</div>
            } @else {
              @for (p of hits(); track p.id) {
                <button
                  type="button"
                  class="hit"
                  role="option"
                  [attr.aria-selected]="false"
                  [disabled]="isRegistered(p)"
                  (click)="pick(p)"
                >
                  <app-avatar [src]="avatar(p)" [name]="p.gamerTag" [size]="36" />
                  <span class="hit-names">
                    <span class="tag">
                      @if (p.prefix) {
                        <span class="prefix">{{ p.prefix }}</span>
                      }
                      {{ p.gamerTag }}
                    </span>
                    <span class="muted small">
                      {{ p.user?.name || (p.user ? p.user.slug : 'No start.gg account') }}
                      @if (p.user?.location?.country) {
                        · {{ p.user?.location?.country }}
                      }
                    </span>
                  </span>
                  @if (isRegistered(p)) {
                    <span class="badge ok">Registered</span>
                  }
                </button>
              } @empty {
                <div class="hint">No players found for “{{ query().trim() }}”.</div>
              }
            }
            <button type="button" class="create-new" (click)="startNew()">
              <span aria-hidden="true">⊕</span> Or add someone without an account
            </button>
          </div>
        } @else if (mode() === 'picked') {
          @if (picked(); as p) {
            <div class="picked">
              <app-avatar [src]="avatar(p)" [name]="p.gamerTag" [size]="56" />
              <div class="spacer">
                <div class="tag big">
                  @if (p.prefix) {
                    <span class="prefix">{{ p.prefix }}</span>
                  }
                  {{ p.gamerTag }}
                </div>
                <div class="muted small">{{ p.user?.name || p.user?.slug || 'No start.gg account' }}</div>
              </div>
              <button type="button" class="sm" (click)="clear()">Change</button>
            </div>
          }
        } @else {
          <div class="new-player stack">
            <div class="row new-head">
              <app-avatar [name]="tag() || '?'" [size]="40" />
              <strong class="spacer">New player without an account</strong>
              <button type="button" class="sm ghost" (click)="clear()">Back to search</button>
            </div>
            <div class="tag-fields">
              <label class="field prefix-field">
                Prefix
                <input name="prefix" [maxlength]="maxPrefix" [ngModel]="prefix()" (ngModelChange)="prefix.set($event)" />
              </label>
              <label class="field">
                Gamer tag *
                <input
                  name="gamerTag"
                  required
                  [maxlength]="maxTag"
                  [ngModel]="tag()"
                  (ngModelChange)="tag.set($event)"
                />
              </label>
            </div>
            <label class="field">
              Name (optional)
              <input name="realName" autocomplete="off" [ngModel]="name()" (ngModelChange)="name.set($event)" />
              <span class="small">start.gg has no name field for players without an account, so it is saved as an admin note.</span>
            </label>
            @if (tagError()) {
              <div class="small error-text">{{ tagError() }}</div>
            }
          </div>
        }

        @if (error()) {
          <div class="alert error small" role="alert">{{ error() }}</div>
        }
      </div>

      <footer>
        <button type="submit" class="primary" [disabled]="!canSubmit()">
          @if (busy()) {
            <span class="spinner sm"></span> Adding…
          } @else {
            Add Attendee
          }
        </button>
        <button type="button" class="cancel" [disabled]="busy()" (click)="ref.close()">Cancel</button>
      </footer>
    </form>
  `,
})
export class AddAttendeeDialog implements OnDestroy {
  protected readonly ref = inject<DialogRef<AddAttendeeResult>>(DialogRef);
  protected readonly data = inject<AddAttendeeData>(DIALOG_DATA);
  private readonly attendees = inject(AttendeesApi);

  protected readonly maxTag = MAX_GAMER_TAG;
  protected readonly maxPrefix = MAX_PREFIX;
  protected readonly attendeesUrl = startggAdminUrl(this.data.tournamentSlug, 'attendees');

  protected readonly mode = signal<'search' | 'picked' | 'new'>('search');
  protected readonly query = signal('');
  protected readonly hits = signal<PlayerHit[]>([]);
  protected readonly searching = signal(false);
  protected readonly searchError = signal<string | null>(null);
  protected readonly picked = signal<PlayerHit | null>(null);
  protected readonly tag = signal('');
  protected readonly prefix = signal('');
  protected readonly name = signal('');
  protected readonly busy = signal(false);
  protected readonly error = signal<string | null>(null);

  protected readonly tagError = computed(() => (this.tag() ? validateTag(this.tag(), this.prefix()) : null));
  protected readonly canSubmit = computed(() => {
    if (this.busy() || this.data.blockedReason) return false;
    if (this.mode() === 'picked') return !!this.picked() && !this.isRegistered(this.picked()!);
    if (this.mode() === 'new') return !validateTag(this.tag(), this.prefix());
    return false;
  });

  private readonly registered = new Set(this.data.registeredPlayerIds.map(String));
  private timer: ReturnType<typeof setTimeout> | null = null;
  private searchSeq = 0;

  ngOnDestroy(): void {
    if (this.timer) clearTimeout(this.timer);
  }

  protected onQuery(value: string): void {
    this.query.set(value);
    this.searchError.set(null);
    if (this.timer) clearTimeout(this.timer);
    if (!value.trim()) {
      this.hits.set([]);
      this.searching.set(false);
      return;
    }
    this.searching.set(true);
    this.timer = setTimeout(() => void this.search(value), SEARCH_DEBOUNCE_MS);
  }

  private async search(value: string): Promise<void> {
    const seq = ++this.searchSeq;
    try {
      const hits = await this.attendees.searchPlayers(value, this.data.tournamentId);
      if (seq === this.searchSeq) this.hits.set(hits);
    } catch (e) {
      if (seq !== this.searchSeq) return;
      this.hits.set([]);
      this.searchError.set(
        parseUserSlug(value)
          ? errorMessage(e)
          : `${errorMessage(e)} You can still paste a start.gg profile URL (start.gg/user/…).`,
      );
    } finally {
      if (seq === this.searchSeq) this.searching.set(false);
    }
  }

  protected isRegistered(p: PlayerHit): boolean {
    return p.isInTournament === true || this.registered.has(String(p.id));
  }

  protected avatar(p: PlayerHit): string | null {
    return profileImage(p.user?.images);
  }

  protected pick(p: PlayerHit): void {
    this.picked.set(p);
    this.mode.set('picked');
    this.error.set(null);
  }

  protected startNew(): void {
    const typed = this.query().trim();
    if (typed && !parseUserSlug(typed)) this.tag.set(typed.slice(0, MAX_GAMER_TAG));
    this.mode.set('new');
    this.error.set(null);
  }

  protected clear(): void {
    this.picked.set(null);
    this.mode.set('search');
    this.error.set(null);
  }

  protected async submit(): Promise<void> {
    if (!this.canSubmit()) return;
    const p = this.picked();
    const attendee: NewAttendee =
      this.mode() === 'picked' && p
        ? { kind: 'existing', playerId: p.id }
        : { kind: 'new', gamerTag: this.tag(), prefix: this.prefix(), name: this.name() };
    const label =
      attendee.kind === 'existing' ? attendeeLabel(p!.gamerTag, p!.prefix) : attendeeLabel(this.tag().trim(), this.prefix().trim());
    this.busy.set(true);
    this.error.set(null);
    try {
      const { participantId, placement } = await this.attendees.register(
        this.data.tournamentId,
        this.data.eventId,
        attendee,
      );
      this.ref.close({ participantId, label, placement });
    } catch (e) {
      this.error.set(`start.gg: ${errorMessage(e)}`);
    } finally {
      this.busy.set(false);
    }
  }
}
