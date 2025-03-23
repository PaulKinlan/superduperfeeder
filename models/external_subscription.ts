// External subscription model for subscribing to external WebSub hubs. This specifically is used for managing the /api/webhook part of the site, not the actual WebSub hub itself that we also run.

import { crypto } from "../deps.ts";

// Interface for external subscription data
export interface ExternalSubscription {
  id: string;
  topic: string; // The feed URL
  hub: string; // The external hub URL (or our own hub URL if fallback)
  callbackPath: string; // Our callback path for this subscription
  secret: string; // Secret for verifying updates
  leaseSeconds: number; // Subscription duration
  created: Date;
  expires: Date;
  verified: boolean;
  lastRenewed?: Date;
  lastError?: string;
  lastErrorTime?: Date; // When the last error occurred
  errorCount: number;
  usingFallback: boolean; // Whether we're using our own hub as fallback
  userCallbackUrl?: string; // External URL to forward updates to
}

// Class for managing external subscriptions in DenoKV
export class ExternalSubscriptionStore {
  private kv: Deno.Kv;

  constructor(kv: Deno.Kv) {
    this.kv = kv;
  }

  // Create a new external subscription
  async create(
    data: Omit<ExternalSubscription, "id" | "created" | "errorCount">,
  ): Promise<ExternalSubscription> {
    const id = crypto.randomUUID();
    const subscription: ExternalSubscription = {
      id,
      created: new Date(),
      errorCount: 0,
      ...data,
    };

    // Store in KV by ID
    await this.kv.set(["external_subscriptions", id], subscription);

    // Also create an index by topic
    await this.kv.set(["external_subscriptions_by_topic", data.topic], id);

    // Also create an index by callback path
    await this.kv.set(
      ["external_subscriptions_by_callback", data.callbackPath],
      id,
    );

    return subscription;
  }

  // Get an external subscription by ID
  async getById(id: string): Promise<ExternalSubscription | null> {
    const result = await this.kv.get<ExternalSubscription>([
      "external_subscriptions",
      id,
    ]);
    return result.value;
  }

  // Get an external subscription by topic
  async getByTopic(topic: string): Promise<ExternalSubscription | null> {
    const idResult = await this.kv.get<string>([
      "external_subscriptions_by_topic",
      topic,
    ]);

    if (!idResult.value) {
      return null;
    }

    return this.getById(idResult.value);
  }

  // Get an external subscription by callback path
  async getByCallbackPath(
    callbackPath: string,
  ): Promise<ExternalSubscription | null> {
    const idResult = await this.kv.get<string>([
      "external_subscriptions_by_callback",
      callbackPath,
    ]);

    if (!idResult.value) {
      return null;
    }

    return this.getById(idResult.value);
  }

  // Update an external subscription
  async update(subscription: ExternalSubscription): Promise<void> {
    await this.kv.set(
      ["external_subscriptions", subscription.id],
      subscription,
    );
  }

  // Delete an external subscription
  async delete(id: string): Promise<void> {
    const subscription = await this.getById(id);
    if (!subscription) {
      return;
    }

    // Remove from KV
    await this.kv.delete(["external_subscriptions", id]);

    // Remove from indexes
    await this.kv.delete([
      "external_subscriptions_by_topic",
      subscription.topic,
    ]);
    await this.kv.delete([
      "external_subscriptions_by_callback",
      subscription.callbackPath,
    ]);
  }

  // Get all external subscriptions
  async getAll(): Promise<ExternalSubscription[]> {
    const entries = await this.kv.list<ExternalSubscription>({
      prefix: ["external_subscriptions"],
    });

    const subscriptions: ExternalSubscription[] = [];
    for await (const entry of entries) {
      subscriptions.push(entry.value);
    }

    return subscriptions;
  }

  // Get expired external subscriptions
  async getExpired(): Promise<ExternalSubscription[]> {
    const now = new Date();
    const all = await this.getAll();

    return all.filter((subscription) => subscription.expires < now);
  }

  // Get external subscriptions that need renewal
  async getNeedingRenewal(
    renewalWindowMinutes = 60,
  ): Promise<ExternalSubscription[]> {
    const now = new Date();
    const renewalThreshold = new Date(now);
    renewalThreshold.setMinutes(now.getMinutes() + renewalWindowMinutes);

    const all = await this.getAll();

    return all.filter(
      (subscription) => subscription.verified && subscription.expires < renewalThreshold,
    );
  }
}
