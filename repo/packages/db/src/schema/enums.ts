import { pgEnum } from 'drizzle-orm/pg-core';

export const roleEnum = pgEnum('role_enum', ['guest', 'client', 'merchant', 'operations', 'administrator']);
export const visibilityEnum = pgEnum('visibility_enum', ['public', 'private', 'restricted']);
export const offeringStatusEnum = pgEnum('offering_status_enum', ['draft', 'active', 'archived']);
export const mediaTypeEnum = pgEnum('media_type_enum', ['photo', 'video']);
export const processingStatusEnum = pgEnum('processing_status_enum', ['pending', 'processing', 'ready', 'failed']);
export const dupStatusEnum = pgEnum('dup_status_enum', ['pending', 'merged', 'dismissed']);
export const ruleStatusEnum = pgEnum('rule_status_enum', ['draft', 'active', 'deprecated']);
export const restrictionTypeEnum = pgEnum('restriction_type_enum', ['lockout', 'penalty', 'manual']);
export const eventStatusEnum = pgEnum('event_status_enum', ['scheduled', 'confirmed', 'completed', 'cancelled']);
export const registrationStatusEnum = pgEnum('registration_status_enum', ['registered', 'confirmed', 'attended', 'no_show', 'cancelled']);
