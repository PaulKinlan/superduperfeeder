import { Router } from "../deps.ts";
import type { Context } from "@oak/oak";
import { config } from "../config.ts";

import staticRouter from "./static.ts";
import webhookRouter from "./webhook.ts";

// Create the main router
const router = new Router();

// Basic routes
router.get("/", (ctx: Context) => {
  // Redirect to the UI
  ctx.response.redirect("/ui");
});

// API info endpoint
router.get("/api", (ctx: Context) => {
  ctx.response.body = {
    name: config.name,
    description: config.description,
    version: config.version,
    documentation: "See /docs for API documentation",
  };
});

// Health check endpoint
router.get("/health", (ctx: Context) => {
  ctx.response.body = { status: "ok", timestamp: new Date().toISOString() };
});

// Mount the static router
router.use(staticRouter.routes());
router.use(staticRouter.allowedMethods());

// Mount the webhook router
router.use(webhookRouter.routes());
router.use(webhookRouter.allowedMethods());

export default router;
