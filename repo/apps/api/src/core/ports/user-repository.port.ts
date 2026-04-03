import type { Role } from '@studioops/shared';

export interface UserRecord {
  id: string;
  username: string;
  passwordHash: string;
  role: Role;
  orgId: string | null;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface CreateUserInput {
  username: string;
  passwordHash: string;
  role: Role;
}

export interface UserRepositoryPort {
  findByUsername(username: string): Promise<UserRecord | null>;
  findById(id: string): Promise<UserRecord | null>;
  create(input: CreateUserInput): Promise<UserRecord>;
}
