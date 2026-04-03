export const ROLES = ['guest', 'client', 'merchant', 'operations', 'administrator'] as const;
export type Role = (typeof ROLES)[number];

export const VISIBILITY_TYPES = ['public', 'private', 'restricted'] as const;
export type VisibilityType = (typeof VISIBILITY_TYPES)[number];

export const OFFERING_STATUSES = ['draft', 'active', 'archived'] as const;
export type OfferingStatus = (typeof OFFERING_STATUSES)[number];

export const MEDIA_TYPES = ['photo', 'video'] as const;
export type MediaType = (typeof MEDIA_TYPES)[number];

export const PROCESSING_STATUSES = ['pending', 'processing', 'ready', 'failed'] as const;
export type ProcessingStatus = (typeof PROCESSING_STATUSES)[number];

export const DUP_STATUSES = ['pending', 'merged', 'dismissed'] as const;
export type DupStatus = (typeof DUP_STATUSES)[number];

export const RULE_STATUSES = ['draft', 'active', 'deprecated'] as const;
export type RuleStatus = (typeof RULE_STATUSES)[number];

export const RESTRICTION_TYPES = ['lockout', 'penalty', 'manual'] as const;
export type RestrictionType = (typeof RESTRICTION_TYPES)[number];

export const EVENT_STATUSES = ['scheduled', 'confirmed', 'completed', 'cancelled'] as const;
export type EventStatus = (typeof EVENT_STATUSES)[number];

export const REGISTRATION_STATUSES = ['registered', 'confirmed', 'attended', 'no_show', 'cancelled'] as const;
export type RegistrationStatus = (typeof REGISTRATION_STATUSES)[number];
