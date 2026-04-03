import { Directive } from '@angular/core';

@Directive({
  selector: '[hlmLabel]',
  standalone: true,
  host: {
    class: 'text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70',
  },
})
export class HlmLabelDirective {}
