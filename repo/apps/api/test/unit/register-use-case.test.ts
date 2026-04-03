import { describe, it, expect, vi, beforeEach } from 'vitest';
import { RegisterUseCase, ValidationError, ConflictError } from '../../src/core/use-cases/register';
import type { PasswordHasherPort } from '../../src/core/ports/password-hasher.port';
import type { UserRepositoryPort, UserRecord } from '../../src/core/ports/user-repository.port';

function makeUser(overrides: Partial<UserRecord> = {}): UserRecord {
  return {
    id: 'user-1',
    username: 'testuser',
    passwordHash: 'hashed',
    role: 'client',
    orgId: null,
    isActive: true,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

describe('RegisterUseCase', () => {
  let userRepo: UserRepositoryPort;
  let passwordHasher: PasswordHasherPort;
  let useCase: RegisterUseCase;

  beforeEach(() => {
    userRepo = {
      findByUsername: vi.fn().mockResolvedValue(null),
      findById: vi.fn().mockResolvedValue(null),
      create: vi.fn().mockImplementation((input) =>
        Promise.resolve(makeUser({ username: input.username, passwordHash: input.passwordHash })),
      ),
    };
    passwordHasher = {
      hash: vi.fn().mockResolvedValue('argon2_hash'),
      verify: vi.fn().mockResolvedValue(true),
    };
    useCase = new RegisterUseCase(userRepo, passwordHasher);
  });

  it('creates user with hashed password', async () => {
    const result = await useCase.execute({
      username: 'NewUser',
      password: 'ValidPass123!@',
    });

    expect(result.username).toBe('newuser'); // normalized to lowercase
    expect(result.id).toBe('user-1');
    expect(passwordHasher.hash).toHaveBeenCalledWith('ValidPass123!@');
    expect(userRepo.create).toHaveBeenCalledWith({
      username: 'newuser',
      passwordHash: 'argon2_hash',
      role: 'client',
    });
  });

  it('rejects duplicate username', async () => {
    vi.mocked(userRepo.findByUsername).mockResolvedValue(makeUser());

    await expect(
      useCase.execute({ username: 'testuser', password: 'ValidPass123!@' }),
    ).rejects.toThrow(ConflictError);
  });

  it('rejects weak password', async () => {
    await expect(
      useCase.execute({ username: 'newuser', password: 'short' }),
    ).rejects.toThrow(ValidationError);
  });

  it('rejects empty username', async () => {
    await expect(
      useCase.execute({ username: '  ', password: 'ValidPass123!@' }),
    ).rejects.toThrow(ValidationError);
  });

  it('returns result without password hash', async () => {
    const result = await useCase.execute({
      username: 'newuser',
      password: 'ValidPass123!@',
    });

    expect(result).not.toHaveProperty('passwordHash');
    expect(result).toHaveProperty('id');
    expect(result).toHaveProperty('username');
    expect(result).toHaveProperty('createdAt');
  });

  it('normalizes username to lowercase', async () => {
    await useCase.execute({
      username: '  MiXeD_CaSe  ',
      password: 'ValidPass123!@',
    });

    expect(userRepo.findByUsername).toHaveBeenCalledWith('mixed_case');
  });
});
