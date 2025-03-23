import { Application, oakCors } from "./deps.ts";
import type { Context, Next } from "@oak/oak";
import { config } from "./config.ts";

// Import routes
import router from "./routes/index.ts";

// Import services
import { WebhookService } from "./services/webhook.ts";
import { STATUS_CODE } from "@std/http";

// Initialize the application
const app = new Application();

// Basic middleware
app.use(oakCors()); // Enable CORS
app.use(async (ctx: Context, next: Next) => {
  try {
    await next();
  } catch (err: unknown) {
    console.error(err);
    const status =
      err instanceof Error && "status" in err
        ? (err as { status: number }).status
        : STATUS_CODE.InternalServerError;

    const message =
      err instanceof Error ? err.message : "Internal Server Error";

    ctx.response.status = status;
    ctx.response.body = {
      success: false,
      message,
    };
  }
});

// Log requests
app.use(async (ctx: Context, next: Next) => {
  const start = Date.now();
  await next();
  const ms = Date.now() - start;
  console.log(`${ctx.request.method} ${ctx.request.url.pathname} - ${ms}ms`);
});

// Apply routers
app.use(router.routes());
app.use(router.allowedMethods());

// Start the server
const port = config.port || 8000;
console.log(`Server running on http://localhost:${port}`);

// Start the services
console.log("Starting services...");

// Set up a cron job to renew subscriptions every hour
Deno.cron("Renew WebSub Subscriptions", "0/10 * * * *", async () => {
  console.log("Running scheduled subscription renewal...");
  console.log(await WebhookService.renewSubscriptions());
});

// Set up a cron job to clean up expired verification tokens every hour
Deno.cron("Clean Up Expired Verifications", "0/10 * * * *", async () => {
  console.log("Running scheduled cleanup of expired verifications...");
  console.log(await WebhookService.cleanupExpiredVerifications());
});

// Set up a cron job to clear expired subscriptions every hour
// Deno.cron("Clear Expired Subscriptions", "0 * * * *", async () => {
//   console.log("Running scheduled cleanup of expired subscriptions...");
//   console.log(await WebhookService.clearExpiredSubscriptions());
// });

// Set up a queue to process async tasks,

// Start the server
await app.listen({ port });
