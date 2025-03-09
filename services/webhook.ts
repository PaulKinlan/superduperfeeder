// Webhook service for subscribing to external WebSub hubs

import { config } from "../config.ts";
import { getDatabase } from "../utils/database.ts";
import { ExternalSubscription } from "../models/external_subscription.ts";
import { crypto, parseFeed } from "../deps.ts";
import { HubService } from "./hub.ts";

// Class for handling webhook functionality
export class WebhookService {
  // Subscribe to a feed, using its hub if available or falling back to our hub
  static async subscribeToFeed(
    topic: string,
    userCallbackUrl?: string
  ): Promise<{
    success: boolean;
    message: string;
    usingExternalHub: boolean;
    subscriptionId?: string;
    callbackId?: string;
  }> {
    try {
      const db = await getDatabase();

      // If a userCallbackUrl is provided, check if it already exists for this topic
      let callbackId: string | undefined;
      if (userCallbackUrl) {
        const existingCallback = await db.userCallbacks.getByTopicAndUrl(
          topic,
          userCallbackUrl
        );

        if (existingCallback) {
          callbackId = existingCallback.id;
        } else {
          // Create a new user callback
          const newCallback = await db.userCallbacks.create({
            topic,
            callbackUrl: userCallbackUrl,
          });
          callbackId = newCallback.id;
        }
      }

      // Check if we already have a subscription for this topic
      const existingSubscription = await db.externalSubscriptions.getByTopic(
        topic
      );
      if (existingSubscription) {
        return {
          success: true,
          message: userCallbackUrl
            ? "Added callback URL to existing subscription"
            : "Already subscribed to this topic",
          usingExternalHub: !existingSubscription.usingFallback,
          subscriptionId: existingSubscription.id,
          callbackId,
        };
      }

      // Prepare headers for the request
      const headers: HeadersInit = {
        "User-Agent": `SuperDuperFeeder/${config.version}`,
      };

      // Fetch the content
      const response = await fetch(topic, {
        method: "GET",
        headers,
      });

      if (!response.ok) {
        console.error(
          `Failed to fetch topic: ${topic}, status: ${response.status}`
        );
        // If we can't fetch the topic, try using our own hub as fallback
        return await WebhookService.subscribeToOwnHub(topic, userCallbackUrl);
      }

      const contentType = response.headers.get("Content-Type") || "";

      // First, check for WebSub hub in HTTP Link headers
      let hubUrl: string | undefined;
      const linkHeader = response.headers.get("Link");

      if (linkHeader) {
        // Parse Link header
        const linkMatches = [
          ...linkHeader.matchAll(/<([^>]+)>;\s*rel=["']?([^"',]+)["']?/g),
        ];
        for (const match of linkMatches) {
          if (match[2] === "hub") {
            hubUrl = match[1];
            console.log(`Found WebSub hub in Link header: ${hubUrl}`);
            break;
          }
        }
      }

      // If no hub found in headers, check the content
      if (!hubUrl) {
        const content = await response.text();

        // Try to parse as a feed
        try {
          const parsedFeed = await parseFeed(content);

          // Check for WebSub hub link in feed
          try {
            if (parsedFeed.links && Array.isArray(parsedFeed.links)) {
              for (const link of parsedFeed.links) {
                if (
                  typeof link === "object" &&
                  link !== null &&
                  "rel" in link &&
                  (link as any).rel === "hub" &&
                  "href" in link &&
                  (link as any).href
                ) {
                  hubUrl = (link as any).href as string;
                  console.log(`Found WebSub hub in feed: ${hubUrl}`);
                  break;
                }
              }
            }
          } catch (e) {
            console.error("Error checking for WebSub hub in feed:", e);
          }
        } catch (parseError) {
          // Not a feed, check if it's an HTML page
          if (contentType.includes("text/html")) {
            // Check for hub link in HTML
            const hubLinkRegex =
              /<link[^>]+rel=["']hub["'][^>]+href=["']([^"']+)["'][^>]*>/i;
            const hubMatch = content.match(hubLinkRegex);

            if (hubMatch && hubMatch[1]) {
              hubUrl = hubMatch[1];

              // Handle relative URLs
              if (hubUrl.startsWith("/") || !hubUrl.startsWith("http")) {
                const baseUrl = new URL(topic);
                hubUrl = new URL(hubUrl, baseUrl.origin).toString();
              }

              console.log(`Found WebSub hub in HTML: ${hubUrl}`);
            }

            // If no hub found, check for feed links
            if (!hubUrl) {
              const feedLinkRegex =
                /<link[^>]+rel=["'](?:alternate|feed)["'][^>]+href=["']([^"']+)["'][^>]*>/i;
              const match = content.match(feedLinkRegex);

              if (match && match[1]) {
                let feedUrl = match[1];

                // Handle relative URLs
                if (feedUrl.startsWith("/") || !feedUrl.startsWith("http")) {
                  const baseUrl = new URL(topic);
                  feedUrl = new URL(feedUrl, baseUrl.origin).toString();
                }

                console.log(`Found feed link in HTML: ${feedUrl}`);

                // Recursively check the feed URL
                return await WebhookService.subscribeToFeed(
                  feedUrl,
                  userCallbackUrl
                );
              }
            }
          }
        }
      }

      // If we found a hub, subscribe to it
      if (hubUrl) {
        console.log(`Using WebSub hub for ${topic}: ${hubUrl}`);
        const result = await WebhookService.subscribeToExternalHub(
          topic,
          hubUrl,
          userCallbackUrl
        );
        return {
          ...result,
          usingExternalHub: true,
        };
      } else {
        // No hub found, use our own hub
        console.log(`No WebSub hub found for ${topic}, using fallback`);
        return await WebhookService.subscribeToOwnHub(topic, userCallbackUrl);
      }
    } catch (error) {
      console.error(`Error subscribing to feed: ${topic}`, error);
      // If there's an error, try using our own hub as fallback
      return await WebhookService.subscribeToOwnHub(topic, userCallbackUrl);
    }
  }

  // Subscribe to an external hub
  static async subscribeToExternalHub(
    topic: string,
    hub: string,
    userCallbackUrl?: string
  ): Promise<{
    success: boolean;
    message: string;
    subscriptionId?: string;
  }> {
    try {
      const db = await getDatabase();

      // Generate a callback path
      const callbackId = crypto.randomUUID();
      const callbackPath = `/callback/${callbackId}`;
      const callbackUrl = `${config.baseUrl}${callbackPath}`;

      // Generate a secret
      const secret = crypto.randomUUID();

      // Determine lease seconds
      const leaseSeconds = config.defaultLeaseSeconds;

      // Create expiration date
      const expires = new Date();
      expires.setSeconds(expires.getSeconds() + leaseSeconds);

      // Create the subscription in our database
      const subscription = await db.externalSubscriptions.create({
        topic,
        hub,
        callbackPath,
        secret,
        leaseSeconds,
        expires,
        verified: false,
        usingFallback: false,
        userCallbackUrl,
      });

      // Prepare the subscription request
      const formData = new FormData();
      formData.append("hub.callback", callbackUrl);
      formData.append("hub.mode", "subscribe");
      formData.append("hub.topic", topic);
      formData.append("hub.lease_seconds", leaseSeconds.toString());
      formData.append("hub.secret", secret);

      // Send the subscription request to the hub
      const response = await fetch(hub, {
        method: "POST",
        headers: {
          "User-Agent": `SuperDuperFeeder/${config.version}`,
        },
        body: formData,
      });

      // Check the response
      if (!response.ok) {
        const errorText = await response.text();
        console.error(
          `Failed to subscribe to ${topic} via ${hub}: ${response.status} ${response.statusText}`,
          errorText
        );

        // Update the subscription with the error
        subscription.errorCount++;
        subscription.lastError = `Failed to subscribe: ${response.status} ${response.statusText}`;
        subscription.lastErrorTime = new Date();
        await db.externalSubscriptions.update(subscription);

        // Try using our own hub as fallback
        return await WebhookService.subscribeToOwnHub(topic, userCallbackUrl);
      }

      console.log(`Subscription request sent to ${hub} for ${topic}`);

      return {
        success: true,
        message: "Subscription request sent to hub",
        subscriptionId: subscription.id,
      };
    } catch (error) {
      console.error(`Error subscribing to external hub: ${error}`);
      // If there's an error, try using our own hub as fallback
      return await WebhookService.subscribeToOwnHub(topic, userCallbackUrl);
    }
  }

  // Subscribe to our own hub (fallback)
  static async subscribeToOwnHub(
    topic: string,
    userCallbackUrl?: string
  ): Promise<{
    success: boolean;
    message: string;
    usingExternalHub: boolean;
    subscriptionId?: string;
  }> {
    try {
      const db = await getDatabase();

      // Generate a callback path
      const callbackId = crypto.randomUUID();
      const callbackPath = `/callback/${callbackId}`;
      const callbackUrl = `${config.baseUrl}${callbackPath}`;

      // Generate a secret
      const secret = crypto.randomUUID();

      // Determine lease seconds
      const leaseSeconds = config.defaultLeaseSeconds;

      // Create expiration date
      const expires = new Date();
      expires.setSeconds(expires.getSeconds() + leaseSeconds);

      // Create the subscription in our database
      const subscription = await db.externalSubscriptions.create({
        topic,
        hub: config.hubUrl,
        callbackPath,
        secret,
        leaseSeconds,
        expires,
        verified: false,
        usingFallback: true,
        userCallbackUrl,
      });

      // Check if the feed exists in our database
      let feed = await db.feeds.getByUrl(topic);

      if (!feed) {
        // Add the feed to our database for polling
        const feedCheck = await HubService.checkAndAddFeedForPolling(topic);

        if (!feedCheck.success) {
          // Update the subscription with the error
          subscription.errorCount++;
          subscription.lastError = "Failed to add feed for polling";
          subscription.lastErrorTime = new Date();
          await db.externalSubscriptions.update(subscription);

          return {
            success: false,
            message: "Failed to add feed for polling",
            usingExternalHub: false,
          };
        }
      }

      // Mark the subscription as verified since we're using our own hub
      subscription.verified = true;
      await db.externalSubscriptions.update(subscription);

      return {
        success: true,
        message: "Subscribed using our own hub",
        usingExternalHub: false,
        subscriptionId: subscription.id,
      };
    } catch (error) {
      console.error(`Error subscribing to own hub: ${error}`);
      return {
        success: false,
        message: `Error subscribing to own hub: ${error}`,
        usingExternalHub: false,
      };
    }
  }

  // Handle callbacks from external hubs
  static async handleCallback(
    callbackPath: string,
    mode: string,
    topic: string,
    challenge?: string,
    leaseSeconds?: number,
    body?: string,
    contentType?: string
  ): Promise<{
    success: boolean;
    message: string;
    challenge?: string;
  }> {
    try {
      const db = await getDatabase();

      // Get the subscription by callback path
      const subscription = await db.externalSubscriptions.getByCallbackPath(
        callbackPath
      );

      if (!subscription) {
        console.error(
          `Subscription not found for callback path: ${callbackPath}`
        );
        return {
          success: false,
          message: "Subscription not found",
        };
      }

      // Verify that the topic matches
      if (subscription.topic !== topic) {
        console.error(
          `Topic mismatch for subscription ${subscription.id}: expected ${subscription.topic}, got ${topic}`
        );
        return {
          success: false,
          message: "Topic mismatch",
        };
      }

      // Handle verification request
      if (mode === "subscribe" || mode === "unsubscribe") {
        if (!challenge) {
          return {
            success: false,
            message: "Missing challenge",
          };
        }

        if (mode === "subscribe") {
          // Update the subscription
          subscription.verified = true;

          if (leaseSeconds) {
            subscription.leaseSeconds = leaseSeconds;
            const expires = new Date();
            expires.setSeconds(expires.getSeconds() + leaseSeconds);
            subscription.expires = expires;
          }

          await db.externalSubscriptions.update(subscription);

          console.log(`Subscription ${subscription.id} verified`);
        } else if (mode === "unsubscribe") {
          // Delete the subscription
          await db.externalSubscriptions.delete(subscription.id);
          console.log(`Subscription ${subscription.id} unsubscribed`);
        }

        // Return the challenge
        return {
          success: true,
          message: `Verification successful for ${mode}`,
          challenge,
        };
      }

      // Handle content notification
      if (body && contentType) {
        // Verify that the subscription is verified
        if (!subscription.verified) {
          console.error(
            `Received content for unverified subscription: ${subscription.id}`
          );
          return {
            success: false,
            message: "Subscription not verified",
          };
        }

        // Process the content
        console.log(`Received content for subscription ${subscription.id}`);

        // Get all user callbacks for this topic
        const userCallbacks = await db.userCallbacks.getByTopic(topic);

        // Forward to all user callbacks
        if (userCallbacks.length > 0) {
          console.log(
            `Forwarding content to ${userCallbacks.length} callbacks`
          );

          for (const callback of userCallbacks) {
            try {
              const response = await fetch(callback.callbackUrl, {
                method: "POST",
                headers: {
                  "Content-Type": contentType,
                  "User-Agent": `SuperDuperFeeder/${config.version}`,
                  "X-SuperDuperFeeder-Topic": topic,
                },
                body,
              });

              // Update the callback's last used time
              callback.lastUsed = new Date();

              if (!response.ok) {
                console.error(
                  `Error forwarding to ${callback.callbackUrl}: ${response.status} ${response.statusText}`
                );

                // Update error information
                callback.errorCount++;
                callback.lastError = `HTTP error: ${response.status} ${response.statusText}`;
                callback.lastErrorTime = new Date();
              } else {
                console.log(
                  `Successfully forwarded content to ${callback.callbackUrl}`
                );

                // Reset error count if successful
                if (callback.errorCount > 0) {
                  callback.errorCount = 0;
                  callback.lastError = undefined;
                  callback.lastErrorTime = undefined;
                }
              }

              // Save the updated callback
              await db.userCallbacks.update(callback);
            } catch (error) {
              console.error(
                `Error forwarding to ${callback.callbackUrl}:`,
                error
              );

              // Update error information
              callback.errorCount++;
              callback.lastError =
                error instanceof Error ? error.message : String(error);
              callback.lastErrorTime = new Date();

              // Save the updated callback
              await db.userCallbacks.update(callback);
            }
          }
        }

        return {
          success: true,
          message: "Content received and processed",
        };
      }

      return {
        success: false,
        message: "Invalid request",
      };
    } catch (error) {
      console.error(`Error handling callback: ${error}`);
      return {
        success: false,
        message: `Error handling callback: ${error}`,
      };
    }
  }

  // Renew subscriptions that are about to expire
  static async renewSubscriptions(): Promise<{
    success: boolean;
    message: string;
    renewed: number;
  }> {
    try {
      const db = await getDatabase();

      // Get subscriptions that need renewal
      const subscriptions = await db.externalSubscriptions.getNeedingRenewal();

      if (subscriptions.length === 0) {
        return {
          success: true,
          message: "No subscriptions need renewal",
          renewed: 0,
        };
      }

      let renewed = 0;

      for (const subscription of subscriptions) {
        try {
          if (subscription.usingFallback) {
            // For fallback subscriptions, just update the expiration
            const expires = new Date();
            expires.setSeconds(
              expires.getSeconds() + subscription.leaseSeconds
            );
            subscription.expires = expires;
            subscription.lastRenewed = new Date();
            await db.externalSubscriptions.update(subscription);
            renewed++;
          } else {
            // For external hub subscriptions, send a new subscription request
            const callbackUrl = `${config.baseUrl}${subscription.callbackPath}`;

            // Prepare the subscription request
            const formData = new FormData();
            formData.append("hub.callback", callbackUrl);
            formData.append("hub.mode", "subscribe");
            formData.append("hub.topic", subscription.topic);
            formData.append(
              "hub.lease_seconds",
              subscription.leaseSeconds.toString()
            );
            formData.append("hub.secret", subscription.secret);

            // Send the subscription request to the hub
            const response = await fetch(subscription.hub, {
              method: "POST",
              headers: {
                "User-Agent": `SuperDuperFeeder/${config.version}`,
              },
              body: formData,
            });

            if (response.ok) {
              // Update the last renewed time
              subscription.lastRenewed = new Date();
              await db.externalSubscriptions.update(subscription);
              renewed++;
            } else {
              // Update the subscription with the error
              subscription.errorCount++;
              subscription.lastError = `Failed to renew: ${response.status} ${response.statusText}`;
              subscription.lastErrorTime = new Date();
              await db.externalSubscriptions.update(subscription);
            }
          }
        } catch (error) {
          console.error(
            `Error renewing subscription ${subscription.id}: ${error}`
          );

          // Update the subscription with the error
          subscription.errorCount++;
          subscription.lastError = `Error renewing: ${error}`;
          subscription.lastErrorTime = new Date();
          await db.externalSubscriptions.update(subscription);
        }
      }

      return {
        success: true,
        message: `Renewed ${renewed} of ${subscriptions.length} subscriptions`,
        renewed,
      };
    } catch (error) {
      console.error(`Error renewing subscriptions: ${error}`);
      return {
        success: false,
        message: `Error renewing subscriptions: ${error}`,
        renewed: 0,
      };
    }
  }

  // Start the subscription renewal service
  static async startRenewalService(): Promise<void> {
    console.log("Starting subscription renewal service...");

    // Renew subscriptions immediately
    await WebhookService.renewSubscriptions();

    // Set up a cron job to renew subscriptions every hour
    Deno.cron("Renew WebSub Subscriptions", "0 * * * *", async () => {
      console.log("Running scheduled subscription renewal...");
      await WebhookService.renewSubscriptions();
    });
  }
}
