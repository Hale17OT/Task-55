import type { OfferingStatus, VisibilityType, Role } from '@studioops/shared';

export interface OfferingRecord {
  id: string;
  orgId: string;
  merchantId: string;
  title: string;
  description: string | null;
  basePriceCents: number;
  durationMinutes: number;
  tags: string[];
  status: OfferingStatus;
  visibility: VisibilityType;
  createdAt: Date;
  updatedAt: Date;
}

export interface AddonRecord {
  id: string;
  offeringId: string;
  name: string;
  priceCents: number;
  unitDescription: string;
  createdAt: Date;
}

export interface OfferingWithAddons extends OfferingRecord {
  addons: AddonRecord[];
}

export interface ListOfferingsParams {
  page: number;
  limit: number;
  orgId?: string;
  status?: OfferingStatus;
  // Visibility filtering context
  role: Role;
  userId?: string;
  orgScope?: string[];
}

export interface PaginatedOfferings {
  data: OfferingRecord[];
  total: number;
}

export interface CreateOfferingData {
  orgId: string;
  merchantId: string;
  title: string;
  description?: string;
  basePriceCents: number;
  durationMinutes: number;
  visibility: VisibilityType;
  tags?: string[];
}

export interface UpdateOfferingData {
  title?: string;
  description?: string;
  basePriceCents?: number;
  durationMinutes?: number;
  visibility?: VisibilityType;
  tags?: string[];
}

export interface OfferingRepositoryPort {
  create(data: CreateOfferingData): Promise<OfferingRecord>;
  findById(id: string): Promise<OfferingRecord | null>;
  findByIdWithAddons(id: string): Promise<OfferingWithAddons | null>;
  list(params: ListOfferingsParams): Promise<PaginatedOfferings>;
  update(id: string, data: UpdateOfferingData): Promise<OfferingRecord>;
  updateStatus(id: string, status: OfferingStatus, expectedCurrentStatus?: OfferingStatus): Promise<OfferingRecord | null>;
  createAddon(offeringId: string, data: { name: string; priceCents: number; unitDescription: string }): Promise<AddonRecord>;
  deleteAddon(addonId: string): Promise<void>;
  findAddonById(addonId: string): Promise<AddonRecord | null>;
  grantAccess(offeringId: string, userIds: string[], grantedBy: string): Promise<number>;
  revokeAccess(offeringId: string, userId: string): Promise<void>;
  hasAccess(offeringId: string, userId: string): Promise<boolean>;
}
