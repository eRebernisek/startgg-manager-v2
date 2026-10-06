import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { Entrant } from '../core/api/models';
import { AvatarComponent } from './avatar.component';
import { entrantAvatar, participantPrefix } from './display';

/** Avatar + prefix + gamer tag of an entrant. */
@Component({
  selector: 'app-entrant-chip',
  imports: [AvatarComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <app-avatar [src]="avatar()" [name]="entrant()?.name" [size]="size()" />
    <span class="chip-name">
      @if (prefix()) {
        <span class="prefix">{{ prefix() }}</span>
      }
      {{ tag() }}
    </span>
  `,
  host: { class: 'entrant-chip' },
})
export class EntrantChipComponent {
  readonly entrant = input<Entrant | null | undefined>(null);
  readonly placeholder = input('TBD');
  readonly size = input(28);

  protected readonly avatar = computed(() => entrantAvatar(this.entrant()));
  private readonly single = computed(() => {
    const parts = this.entrant()?.participants;
    return parts?.length === 1 ? parts[0] : null;
  });
  protected readonly prefix = computed(() => {
    const p = this.single();
    return p ? participantPrefix(p) : null;
  });
  protected readonly tag = computed(() => {
    const e = this.entrant();
    if (!e) return this.placeholder();
    const p = this.single();
    return p?.player?.gamerTag ?? p?.gamerTag ?? e.name;
  });
}
