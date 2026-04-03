import { Directive } from '@angular/core';

@Directive({
  selector: '[hlmSkeleton]',
  standalone: true,
  host: { class: 'animate-pulse rounded-md bg-[hsl(var(--muted))]' },
})
export class HlmSkeletonDirective {}
