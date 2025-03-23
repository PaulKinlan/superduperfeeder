// Webhook routes for subscribing to external WebSub hubs

import { Router } from "../deps.ts";
import type { Context } from "@oak/oak";
import { WebhookService } from "../services/webhook.ts";

const router = new Router();

// Webhook endpoint for subscribing to feeds
router.post("/api/webhook", async (ctx: Context) => {
  try {
    // Get the topic URL and callback URL from the request
    const body = await ctx.request.body.formData();
    const topic = body.get("topic") as string;
    const callback = body.get("callback") as string | undefined;

    console.log("Webhook request:", { topic, callback });

    if (!topic) {
      console.log("Missing topic parameter");
      console.log("Request request:", ctx.request);
      console.log("Request body:", body);
      ctx.response.status = 400;
      ctx.response.body = {
        success: false,
        message: "Missing topic parameter",
      };
      return;
    }

    // Call WebhookService.subscribeToFeed with the callback URL
    const result = await WebhookService.subscribeToFeed(topic, callback);
    console.log(
      "WebhookService.subscribeToFeed result:",
      result,
      topic,
      callback
    );

    // Return appropriate response
    ctx.response.status = result.success ? 202 : 400;

    // Include information about verification status in the response
    if (result.success && result.pendingVerification) {
      ctx.response.body = {
        ...result,
        message: result.message,
        verificationInstructions:
          "Your callback URL requires verification. A verification request has been sent to your callback URL. The callback should respond with the verification token to confirm ownership.",
      };
    } else {
      ctx.response.body = result;
    }
  } catch (error: unknown) {
    console.error("Error processing webhook request:", error);
    const errorMessage = error instanceof Error ? error.message : String(error);

    ctx.response.status = 500;
    ctx.response.body = {
      success: false,
      message: `Internal server error: ${errorMessage}`,
    };
  }
});

// Callback route for external hubs. They will tell us when there is new content, or they need to verify our subscription.
router.all("/callback/:id", async (ctx: Context) => {
  try {
    // Get the ID from the URL path
    const id = ctx.request.url.pathname.split("/").pop();
    const callbackPath = `/callback/${id}`;

    console.log("Callback request:", { id, callbackPath });
    console.log("Request headers:", ctx.request.headers);
    console.log("searchParams", ctx.request.url.searchParams);

    // Get query parameters for verification
    const query = ctx.request.url.searchParams;
    const mode = query.get("hub.mode");
    const topic = query.get("hub.topic");
    const challenge = query.get("hub.challenge");
    const leaseSeconds = query.get("hub.lease_seconds")
      ? parseInt(query.get("hub.lease_seconds") as string)
      : undefined;

    console.log("Callback request:", { mode, topic, challenge, leaseSeconds });
    // If this is a verification request
    if (mode && topic) {
      // If mode is set then this is a verification request (subscribe or unsubscribe)
      const result = await WebhookService.handleCallback(
        callbackPath,
        mode,
        topic,
        challenge || undefined,
        leaseSeconds
      );

      if (result.success && result.challenge) {
        // For verification requests, we need to return the challenge as plain text
        ctx.response.type = "text/plain";
        ctx.response.body = result.challenge;
        return;
      }

      ctx.response.status = result.success ? 200 : 404;
      ctx.response.body = result.message;
      return;
    }

    // If this is a content notification (POST) from the local hub or external hub.
    if (ctx.request.method === "POST") {
      // Get the topic from the request
      const topic = ctx.request.headers
        .get("Link")
        ?.match(/<([^>]+)>;\s*rel=["']?self["']?/)?.[1];

      if (!topic) {
        ctx.response.status = 400;
        ctx.response.body = "Missing topic";
        return;
      }

      // Prepare the data for WebhookService.handleCallback, we are just sending the topic for now.
      const contentType = "application/json";
      const body = JSON.stringify({
        topic,
      });

      // Process the content
      const result = await WebhookService.handleCallback(
        callbackPath,
        "content",
        topic,
        undefined,
        undefined,
        body,
        contentType
      );

      ctx.response.status = result.success ? 200 : 400;
      ctx.response.body = result.message;
      return;
    }

    // Invalid request
    ctx.response.status = 400;
    ctx.response.body = "Invalid request";
  } catch (error: unknown) {
    console.error("Error processing callback:", error);
    const errorMessage = error instanceof Error ? error.message : String(error);

    ctx.response.status = 500;
    ctx.response.body = `Internal server error: ${errorMessage}`;
  }
});

// Verification endpoint for user callbacks
router.get("/api/webhook/verify/:token", async (ctx: Context) => {
  try {
    // Get the token from the URL path
    const token = ctx.request.url.pathname.split("/").pop();

    if (!token) {
      ctx.response.status = 400;
      ctx.response.body = {
        success: false,
        message: "Missing token parameter",
      };
      return;
    }

    // Call WebhookService.verifyCallback with the token
    const result = await WebhookService.verifyCallback(token);

    // Return appropriate response
    ctx.response.status = result.success ? 200 : 400;
    ctx.response.body = result;
  } catch (error: unknown) {
    console.error("Error processing verification request:", error);
    const errorMessage = error instanceof Error ? error.message : String(error);

    ctx.response.status = 500;
    ctx.response.body = {
      success: false,
      message: `Internal server error: ${errorMessage}`,
    };
  }
});

export default router;
