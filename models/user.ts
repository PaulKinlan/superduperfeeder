// User model for admin authentication

import { compare, hash } from "../deps.ts";

// Interface for user data
export interface User {
  id: string;
  username: string;
  passwordHash: string;
  isAdmin: boolean;
  created: Date;
  lastLogin?: Date;
}

// Class for managing users in DenoKV
export class UserStore {
  private kv: Deno.Kv;

  constructor(kv: Deno.Kv) {
    this.kv = kv;
  }

  // Create a new user
  async create(
    username: string,
    password: string,
    isAdmin = false,
  ): Promise<User> {
    // Check if username already exists
    const existing = await this.getByUsername(username);
    if (existing) {
      throw new Error(`User with username ${username} already exists`);
    }

    const id = crypto.randomUUID();
    const passwordHash = await hash(password);

    const user: User = {
      id,
      username,
      passwordHash,
      isAdmin,
      created: new Date(),
    };

    // Store in KV by ID
    await this.kv.set(["users", id], user);

    // Also create an index by username
    await this.kv.set(["users_by_username", username], id);

    return user;
  }

  // Get a user by ID
  async getById(id: string): Promise<User | null> {
    const result = await this.kv.get<User>(["users", id]);
    return result.value;
  }

  // Get a user by username
  async getByUsername(username: string): Promise<User | null> {
    const idResult = await this.kv.get<string>(["users_by_username", username]);

    if (!idResult.value) {
      return null;
    }

    return this.getById(idResult.value);
  }

  // Update a user
  async update(user: User): Promise<void> {
    await this.kv.set(["users", user.id], user);
  }

  // Delete a user
  async delete(id: string): Promise<void> {
    const user = await this.getById(id);
    if (!user) {
      return;
    }

    // Remove from KV
    await this.kv.delete(["users", id]);

    // Remove from index
    await this.kv.delete(["users_by_username", user.username]);
  }

  // Authenticate a user
  async authenticate(username: string, password: string): Promise<User | null> {
    const user = await this.getByUsername(username);

    if (!user) {
      return null;
    }

    const isValid = await compare(password, user.passwordHash);

    if (!isValid) {
      return null;
    }

    // Update last login time
    user.lastLogin = new Date();
    await this.update(user);

    return user;
  }

  // Change a user's password
  async changePassword(userId: string, newPassword: string): Promise<void> {
    const user = await this.getById(userId);

    if (!user) {
      throw new Error(`User with ID ${userId} not found`);
    }

    user.passwordHash = await hash(newPassword);
    await this.update(user);
  }

  // Initialize the admin user if it doesn't exist
  async initAdminUser(username: string, password: string): Promise<User> {
    try {
      const existing = await this.getByUsername(username);

      if (existing) {
        return existing;
      }

      return await this.create(username, password, true);
    } catch (error) {
      console.error("Error initializing admin user:", error);
      throw error;
    }
  }
}
