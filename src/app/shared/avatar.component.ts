import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { initials } from './display';

@Component({
  selector: 'app-avatar',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (src()) {
      <img [src]="src()" [alt]="name()" loading="lazy" referrerpolicy="no-referrer" />
    } @else {
      <span>{{ letters() }}</span>
    }
  `,
  host: { class: 'avatar', '[style.--size.px]': 'size()' },
})
export class AvatarComponent {
  readonly src = input<string | null>(null);
  readonly name = input<string | null | undefined>('');
  readonly size = input(32);
  protected readonly letters = computed(() => initials(this.name()));
}
