import { validatePassword } from '../domain/password-policy';
import type { PasswordHasherPort } from '../ports/password-hasher.port';
import type { UserRepositoryPort, UserRecord } from '../ports/user-repository.port';

export interface RegisterInput {
  username: string;
  password: string;
}

export interface RegisterResult {
  id: string;
  username: string;
  createdAt: Date;
}

export class RegisterUseCase {
  constructor(
    private userRepo: UserRepositoryPort,
    private passwordHasher: PasswordHasherPort,
  ) {}

  async execute(input: RegisterInput): Promise<RegisterResult> {
    const username = input.username.trim().toLowerCase();

    if (!username) {
      throw new ValidationError('Username is required');
    }

    const passwordCheck = validatePassword(input.password);
    if (!passwordCheck.valid) {
      throw new ValidationError('Password validation failed', passwordCheck.errors);
    }

    const existing = await this.userRepo.findByUsername(username);
    if (existing) {
      throw new ConflictError('Username already exists');
    }

    const passwordHash = await this.passwordHasher.hash(input.password);
    const user = await this.userRepo.create({
      username,
      passwordHash,
      role: 'client',
    });

    return {
      id: user.id,
      username: user.username,
      createdAt: user.createdAt,
    };
  }
}

export class ValidationError extends Error {
  public readonly statusCode = 400;
  public readonly details: string[];

  constructor(message: string, details: string[] = []) {
    super(message);
    this.name = 'ValidationError';
    this.details = details;
  }
}

export class ConflictError extends Error {
  public readonly statusCode = 409;

  constructor(message: string) {
    super(message);
    this.name = 'ConflictError';
  }
}
