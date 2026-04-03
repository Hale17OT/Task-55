import { Directive } from '@angular/core';

@Directive({
  selector: '[hlmSeparator]',
  standalone: true,
  host: { class: 'shrink-0 bg-[hsl(var(--border))] h-[1px] w-full block' },
})
export class HlmSeparatorDirective {}
