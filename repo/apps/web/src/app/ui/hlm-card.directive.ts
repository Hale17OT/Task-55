import { Directive } from '@angular/core';

@Directive({ selector: '[hlmCard]', standalone: true, host: { class: 'rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--card))] text-[hsl(var(--card-foreground))] shadow-sm' } })
export class HlmCardDirective {}

@Directive({ selector: '[hlmCardHeader]', standalone: true, host: { class: 'flex flex-col space-y-1.5 p-6' } })
export class HlmCardHeaderDirective {}

@Directive({ selector: '[hlmCardTitle]', standalone: true, host: { class: 'text-lg font-semibold leading-none tracking-tight' } })
export class HlmCardTitleDirective {}

@Directive({ selector: '[hlmCardDescription]', standalone: true, host: { class: 'text-sm text-[hsl(var(--muted-foreground))]' } })
export class HlmCardDescriptionDirective {}

@Directive({ selector: '[hlmCardContent]', standalone: true, host: { class: 'p-6 pt-0' } })
export class HlmCardContentDirective {}

@Directive({ selector: '[hlmCardFooter]', standalone: true, host: { class: 'flex items-center p-6 pt-0' } })
export class HlmCardFooterDirective {}

export const HlmCardImports = [HlmCardDirective, HlmCardHeaderDirective, HlmCardTitleDirective, HlmCardDescriptionDirective, HlmCardContentDirective, HlmCardFooterDirective] as const;
