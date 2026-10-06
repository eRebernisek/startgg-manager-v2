import { Dialog } from '@angular/cdk/dialog';
import { CdkMenu, CdkMenuItem, CdkMenuTrigger } from '@angular/cdk/menu';
import {
  ChangeDetectionStrategy,
  Component,
  Injector,
  OnDestroy,
  OnInit,
  computed,
  inject,
  signal,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { StartggApi } from '../../core/api/startgg-api.service';
import { StartggWebClient } from '../../core/api/startgg-web-client';
import { AttendeeRow, attendeeRow, displayingText } from '../../core/attendees';
import { startggAdminUrl } from '../../core/bracket-url';
import { ToastService } from '../../core/toast.service';
import { WebSessionService } from '../../core/web-session.service';
import { AvatarComponent } from '../../shared/avatar.component';
import { errorMessage } from '../../shared/display';
import { EventStore } from '../event/event.store';
import { openPlayerDialog } from '../players/player.dialog';
import { openAddAttendee } from './add-attendee.dialog';
import { AttendeeDialogContext, AttendeeTarget, attendeeLabel } from './attendee-dialogs';
import { openEditTag } from './edit-tag.dialog';
import { openRemoveAttendee } from './remove-attendee.dialog';

const PER_PAGE = 40;
const SEARCH_DEBOUNCE_MS = 300;

type Filter = 'all' | 'account' | 'noAccount' | 'unseeded';

@Component({
  selector: 'app-entrants-page',
  imports: [FormsModule, RouterLink, AvatarComponent, CdkMenu, CdkMenuItem, CdkMenuTrigger],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './entrants.page.html',
  styleUrl: './attendees.scss',
})
export class EntrantsPage implements OnInit, OnDestroy {
  protected readonly store = inject(EventStore);
  private readonly api = inject(StartggApi);
  private readonly web = inject(WebSessionService);
  private readonly webClient = inject(StartggWebClient);
  private readonly dialog = inject(Dialog);
  private readonly injector = inject(Injector);
  private readonly toast = inject(ToastService);

  protected readonly rows = signal<AttendeeRow[]>([]);
  protected readonly total = signal(0);
  protected readonly page = signal(0);
  protected readonly totalPages = signal(1);
  protected readonly loading = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly query = signal('');
  protected readonly filter = signal<Filter>('all');
  protected readonly showFilters = signal(false);

  protected readonly visible = computed(() => {
    const f = this.filter();
    return this.rows().filter(
      (r) =>
        f === 'all' ||
        (f === 'account' && !r.noAccount) ||
        (f === 'noAccount' && r.noAccount) ||
        (f === 'unseeded' && r.seed == null),
    );
  });
  protected readonly countText = computed(() =>
    this.filter() === 'all'
      ? displayingText(this.rows().length, this.total())
      : `${this.visible().length} of ${this.rows().length} loaded match the filter`,
  );
  protected readonly transportMissing = computed(() => this.webClient.transport() === 'none');
  protected readonly attendeesUrl = computed(() => startggAdminUrl(this.store.tournamentSlug(), 'attendees'));
  /** Why add/rename/remove cannot run here, shown in the dialogs with a start.gg fallback link. */
  protected readonly blockedReason = computed(() => {
    if (this.webClient.transport() === 'none') {
      return 'This web build cannot reach start.gg’s attendee API (browsers are blocked by CORS). Set a proxy URL in Settings, or use the Android app.';
    }
    if (!this.web.hasSession()) {
      return 'Adding, renaming and removing attendees uses start.gg’s website API, which needs your start.gg website session (gg_session), not the API token. Paste it in Settings.';
    }
    return null;
  });

  private timer: ReturnType<typeof setTimeout> | null = null;
  private loadSeq = 0;

  ngOnInit(): void {
    void this.reload();
  }

  ngOnDestroy(): void {
    if (this.timer) clearTimeout(this.timer);
  }

  protected label = attendeeLabel;

  protected onQuery(value: string): void {
    this.query.set(value);
    if (this.timer) clearTimeout(this.timer);
    this.timer = setTimeout(() => void this.reload(), SEARCH_DEBOUNCE_MS);
  }

  protected async reload(): Promise<void> {
    this.rows.set([]);
    this.page.set(0);
    this.totalPages.set(1);
    await this.loadMore();
  }

  protected async loadMore(): Promise<void> {
    const eventId = this.store.event()?.id;
    if (!eventId) return;
    const seq = ++this.loadSeq;
    this.loading.set(true);
    this.error.set(null);
    try {
      const next = this.page() + 1;
      const conn = await this.api.eventAttendees(eventId, next, PER_PAGE, this.query().trim() || undefined);
      if (seq !== this.loadSeq) return;
      this.rows.update((list) => [...list, ...(conn.nodes ?? []).map(attendeeRow)]);
      this.total.set(conn.pageInfo?.total ?? this.rows().length);
      this.totalPages.set(conn.pageInfo?.totalPages ?? 1);
      this.page.set(next);
    } catch (e) {
      if (seq === this.loadSeq) this.error.set(errorMessage(e));
    } finally {
      if (seq === this.loadSeq) this.loading.set(false);
    }
  }

  private context(): AttendeeDialogContext | null {
    const e = this.store.event();
    if (!e) return null;
    return {
      tournamentId: e.tournament.id,
      tournamentName: e.tournament.name,
      tournamentSlug: this.store.tournamentSlug(),
      eventId: e.id,
      eventName: e.name,
      blockedReason: this.blockedReason(),
    };
  }

  private target(row: AttendeeRow): AttendeeTarget | null {
    const ctx = this.context();
    if (!ctx || row.participantId == null) return null;
    return { ...ctx, participantId: row.participantId, tag: row.tag, prefix: row.prefix, eventCount: row.eventCount };
  }

  protected async add(): Promise<void> {
    const ctx = this.context();
    if (!ctx) return;
    const registeredPlayerIds = this.rows()
      .map((r) => r.playerId)
      .filter((id) => id != null)
      .map(String);
    const ref = openAddAttendee(this.dialog, this.injector, { ...ctx, registeredPlayerIds });
    const result = await firstValueFrom(ref.closed);
    if (!result) return;
    this.toast.ok(
      result.placement.phaseName
        ? `Added ${result.label} to ${ctx.eventName} (${result.placement.phaseName}).`
        : `Added ${result.label} to ${ctx.eventName}.`,
    );
    if (!result.placement.phaseName) {
      this.toast.show(
        'The bracket has already started, so start.gg registered them for the event without placing them in it. Reset the bracket in Seeding to include them.',
        'info',
        9000,
      );
    }
    await this.afterChange();
  }

  protected async rename(row: AttendeeRow): Promise<void> {
    const data = this.target(row);
    if (!data) return;
    const result = await firstValueFrom(openEditTag(this.dialog, this.injector, data).closed);
    if (!result) return;
    this.toast.ok(`Tag changed to ${attendeeLabel(result.gamerTag, result.prefix)}.`);
    await this.afterChange();
  }

  protected async remove(row: AttendeeRow): Promise<void> {
    const data = this.target(row);
    if (!data) return;
    const removed = await firstValueFrom(openRemoveAttendee(this.dialog, this.injector, data).closed);
    if (!removed) return;
    this.toast.ok(`Removed ${attendeeLabel(row.tag, row.prefix)}.`);
    await this.afterChange();
  }

  protected viewPlayer(row: AttendeeRow): void {
    if (row.playerId != null) openPlayerDialog(this.dialog, this.injector, row.playerId);
  }

  protected profileUrl(row: AttendeeRow): string | null {
    return row.userSlug ? `https://www.start.gg/${row.userSlug}` : null;
  }

  private async afterChange(): Promise<void> {
    await this.store.entrantsChanged();
    await this.reload();
  }
}
