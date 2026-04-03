import { Directive, ElementRef, effect, input, inject } from '@angular/core';

type BadgeVariant = 'default' | 'secondary' | 'destructive' | 'outline';

const base = 'inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold transition-colors';

const variants: Record<BadgeVariant, string> = {
  default: 'bg-[hsl(var(--primary))] text-[hsl(var(--primary-foreground))]',
  secondary: 'bg-[hsl(var(--secondary))] text-[hsl(var(--secondary-foreground))]',
  destructive: 'bg-[hsl(var(--destructive))] text-[hsl(var(--destructive-foreground))]',
  outline: 'text-[hsl(var(--foreground))] border border-[hsl(var(--border))]',
};

@Directive({
  selector: '[hlmBadge]',
  standalone: true,
})
export class HlmBadgeDirective {
  private el = inject(ElementRef);
  variant = input<BadgeVariant>('default');

  constructor() {
    effect(() => {
      this.el.nativeElement.className = `${base} ${variants[this.variant()]}`;
    });
  }
}
