// Database utilities for DenoKV

import { config } from "../config.ts";
import { UserStore } from "../models/user.ts";
import { ExternalSubscriptionStore } from "../models/external_subscription.ts";
import { UserCallbackStore } from "../models/user_callback.ts";
import { Queue } from "../models/queue.ts";

// Class for managing the database connection and stores
export class Database {
  private static instance: Database;
  private kv: Deno.Kv;

  // Stores
  public users: UserStore;
  public externalSubscriptions: ExternalSubscriptionStore;
  public userCallbacks: UserCallbackStore;
  public queue: Queue;

  private constructor(kv: Deno.Kv) {
    this.kv = kv;

    // Initialize stores
    this.users = new UserStore(kv);
    this.externalSubscriptions = new ExternalSubscriptionStore(kv);
    this.userCallbacks = new UserCallbackStore(kv);
    this.queue = new Queue(kv);
  }

  // Get the singleton instance
  public static async getInstance(): Promise<Database> {
    if (!Database.instance) {
      // Open the KV store
      let kv: Deno.Kv;

      try {
        // In Deno Deploy, we can just use Deno.openKv()
        kv = await Deno.openKv();

        Database.instance = new Database(kv);

        // Initialize the admin user
        await Database.instance.initAdminUser();
      } catch (error) {
        console.error("Error opening KV store:", error);
        throw error;
      }
    }

    return Database.instance;
  }

  // Initialize the admin user
  private async initAdminUser(): Promise<void> {
    try {
      await this.users.initAdminUser(
        config.admin.username,
        // This is just a placeholder - in a real app, we'd use a secure method
        // to get the admin password, not hardcode it
        "changeme"
      );
    } catch (error) {
      console.error("Error initializing admin user:", error);
    }
  }

  // Close the database connection
  public async close(): Promise<void> {
    await this.kv.close();
  }
}

// Get the database instance
export async function getDatabase(): Promise<Database> {
  return Database.getInstance();
}
