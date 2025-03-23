// Application configuration

export const config = {
  // Application info
  name: "Super Duper Feeder",
  version: "0.1.0",
  description: "A WebSub/PubSubHubbub service for RSS feeds",

  // URLs
  baseUrl: "https://superduperfeeder.deno.dev",
  hubUrl: "https://superduperfeeder-hub.deno.dev",

  // Server configuration
  port: parseInt(Deno.env.get("PORT") || "8000"),
  environment: Deno.env.get("ENVIRONMENT") || "development",

  // WebSub configuration
  defaultLeaseSeconds: 86400, // 24 hours
  maxLeaseSeconds: 2592000, // 30 days

  // RSS polling configuration
  defaultPollingIntervalMinutes: 60, // 1 hour
  minPollingIntervalMinutes: 15, // 15 minutes

  // Admin configuration
  admin: {
    username: Deno.env.get("ADMIN_USERNAME") || "admin",
    // In production, this should be set via environment variable
    passwordHash: Deno.env.get("ADMIN_PASSWORD_HASH") ||
      // Default hash for password "changeme" - DO NOT USE IN PRODUCTION
      "$2a$10$zYBQgLj.1qfUDBgJqCq80eJ1vNjFvFYFDZNgRqPc1JLRsV8qBRpHK",
  },

  // Firehose configuration
  firehose: {
    maxWebhooks: 100, // Maximum number of webhooks per user
    maxWebSocketConnections: 1000, // Maximum number of concurrent WebSocket connections
    webhookTimeout: 10000, // 10 seconds timeout for webhook delivery
    webhookRetries: 3, // Number of retries for failed webhook deliveries
  },
};
