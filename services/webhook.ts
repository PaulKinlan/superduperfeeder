// Webhook service for subscribing to external WebSub hubs

import { config } from "../config.ts";
import { getDatabase } from "../utils/database.ts";
import { crypto, parseFeed } from "../deps.ts";

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
    pendingVerification?: boolean;
  }> {
    try {
      const db = await getDatabase();

      // If a userCallbackUrl is provided, check if it already exists for this topic
      let callbackId: string | undefined;
      let pendingVerification = false;

      if (userCallbackUrl) {
        const existingCallback = await db.userCallbacks.getByTopicAndUrl(
          topic,
          userCallbackUrl
        );

        if (existingCallback) {
          callbackId = existingCallback.id;

          // If callback exists but is not verified, send verification again
          if (!existingCallback.verified) {
            if (!existingCallback.verificationToken) {
              // There was a time when we didn't have token verification
              console.error(
                `No verification token for callback ${existingCallback.id} overwriting`
              );
              existingCallback.verified = true;
              db.userCallbacks.update(existingCallback);
              pendingVerification = false;
            } else {
              await WebhookService.sendVerificationRequest(existingCallback);
              pendingVerification = true;
            }
          }
        } else {
          // Create a new user callback with verification token
          const verificationToken = crypto.randomUUID();
          const verificationExpires = new Date();
          verificationExpires.setHours(verificationExpires.getHours() + 24); // 24 hour expiration

          const newCallback = await db.userCallbacks.create({
            topic,
            callbackUrl: userCallbackUrl,
            verified: false,
            verificationToken,
            verificationExpires,
          });

          callbackId = newCallback.id;

          // Send verification request
          await WebhookService.sendVerificationRequest(newCallback);
          pendingVerification = true;
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
            ? pendingVerification
              ? "Added callback URL to existing subscription (verification pending)"
              : "Added callback URL to existing subscription"
            : "Already subscribed to this topic",
          usingExternalHub: !existingSubscription.usingFallback,
          subscriptionId: existingSubscription.id,
          callbackId,
          pendingVerification,
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
    pendingVerification?: boolean;
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

      // Determine if there's a pending verification for the user callback
      let pendingVerification = false;
      if (userCallbackUrl) {
        const callback = await db.userCallbacks.getByTopicAndUrl(
          topic,
          userCallbackUrl
        );
        if (callback && !callback.verified) {
          pendingVerification = true;
        }
      }

      return {
        success: true,
        message: pendingVerification
          ? "Subscription request sent to hub (callback verification pending)"
          : "Subscription request sent to hub",
        subscriptionId: subscription.id,
        pendingVerification,
      };
    } catch (error) {
      console.error(`Error subscribing to external hub: ${error}`);
      // If there's an error, try using our own hub as fallback
      return await WebhookService.subscribeToOwnHub(topic, userCallbackUrl);
    }
  }

  // Subscribe to our own hub (fallback). This is used when no external hub is available, our Hub will handle polling and then call this "hub" to notify the user
  static async subscribeToOwnHub(
    topic: string,
    userCallbackUrl?: string
  ): Promise<{
    success: boolean;
    message: string;
    usingExternalHub: boolean;
    subscriptionId?: string;
    pendingVerification?: boolean;
  }> {
    try {
      // Determine the hub URL to use (production or localhost)
      const hubUrl = config.hubUrl;

      // Generate a callback path and callback URL for the subscription
      const callbackId = crypto.randomUUID();
      const callbackPath = `/callback/${callbackId}`;
      const callbackUrl = `${config.baseUrl}${callbackPath}`;

      // Generate a secret for the subscription
      const secret = crypto.randomUUID();

      // Determine lease seconds
      const leaseSeconds = config.defaultLeaseSeconds;

      // Prepare the subscription request as FormData
      const formData = new FormData();
      formData.append("hub.callback", callbackUrl);
      formData.append("hub.mode", "subscribe");
      formData.append("hub.topic", topic);
      formData.append("hub.lease_seconds", leaseSeconds.toString());
      formData.append("hub.secret", secret);

      // Add user callback to the request if provided
      if (userCallbackUrl) {
        formData.append("user_callback_url", userCallbackUrl);
      }

      // Send the subscription request to the hub
      const response = await fetch(hubUrl, {
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
          `Failed to subscribe to ${topic} via our hub: ${response.status} ${response.statusText}`,
          errorText
        );

        return {
          success: false,
          message: `Failed to subscribe using our hub: ${response.status} ${response.statusText}`,
          usingExternalHub: false,
        };
      }

      // Try to parse the response as JSON
      let responseData;
      try {
        responseData = await response.json();
      } catch {
        // If not JSON, just use a generic success message
        return {
          success: true,
          message: "Subscribed using our own hub",
          usingExternalHub: false,
          subscriptionId: callbackId,
          pendingVerification: false,
        };
      }

      // Return the hub's response data with additional fields
      return {
        success: true,
        message: responseData.message || "Subscribed using our own hub",
        usingExternalHub: false,
        subscriptionId: responseData.id || callbackId,
        pendingVerification: responseData.pendingVerification || false,
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

        // Forward to all verified user callbacks
        const verifiedCallbacks = userCallbacks.filter(
          (callback) => callback.verified
        );

        if (verifiedCallbacks.length > 0) {
          console.log(
            `Forwarding content to ${
              verifiedCallbacks.length
            } verified callbacks (${
              userCallbacks.length - verifiedCallbacks.length
            } unverified callbacks skipped)`
          );

          for (const callback of verifiedCallbacks) {
            try {
              // Received content from the hub, forward to the user callback
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
            // For fallback subscriptions, make a new subscription request to our hub
            const callbackUrl = `${config.baseUrl}${subscription.callbackPath}`;

            // Prepare the subscription request as FormData
            const formData = new FormData();
            formData.append("hub.callback", callbackUrl);
            formData.append("hub.mode", "subscribe");
            formData.append("hub.topic", subscription.topic);
            formData.append(
              "hub.lease_seconds",
              subscription.leaseSeconds.toString()
            );
            formData.append("hub.secret", subscription.secret);

            // Add user callback to the request if provided
            if (subscription.userCallbackUrl) {
              formData.append(
                "user_callback_url",
                subscription.userCallbackUrl
              );
            }

            // Send the subscription request to the hub
            const response = await fetch(config.hubUrl, {
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

  // Clear expired external subscriptions
  static async clearExpiredSubscriptions(): Promise<{
    success: boolean;
    message: string;
    cleared: number;
  }> {
    try {
      const db = await getDatabase();

      // Get all expired subscriptions
      const expiredSubscriptions = await db.externalSubscriptions.getExpired();

      if (expiredSubscriptions.length === 0) {
        return {
          success: true,
          message: "No expired subscriptions to clear",
          cleared: 0,
        };
      }

      console.log(
        `Found ${expiredSubscriptions.length} expired subscriptions to clear`
      );

      // Delete each expired subscription
      let cleared = 0;
      for (const subscription of expiredSubscriptions) {
        console.log(
          `Deleting expired subscription ${subscription.id} for topic ${subscription.topic}`
        );
        await db.externalSubscriptions.delete(subscription.id);
        cleared++;
      }

      return {
        success: true,
        message: `Cleared ${cleared} expired subscriptions`,
        cleared,
      };
    } catch (error) {
      console.error(`Error clearing expired subscriptions: ${error}`);
      return {
        success: false,
        message: `Error clearing expired subscriptions: ${error}`,
        cleared: 0,
      };
    }
  }

  // Clean up expired verification tokens
  static async cleanupExpiredVerifications(): Promise<{
    success: boolean;
    message: string;
    cleaned: number;
  }> {
    try {
      const db = await getDatabase();
      const now = new Date();
      let cleaned = 0;

      // Get all callbacks
      const callbacks = await db.userCallbacks.getAll();

      // Filter callbacks with expired verification tokens
      const expiredCallbacks = callbacks.filter(
        (callback) =>
          (!callback.verified &&
            callback.verificationExpires &&
            callback.verificationExpires < now) ||
          callback.verified == undefined // There was a time when we didn't have token verification
      );

      console.log(
        `Found ${expiredCallbacks.length} callbacks with expired verification tokens`
      );

      // Delete expired callbacks
      for (const callback of expiredCallbacks) {
        console.log(
          `Deleting callback ${callback.id} with expired verification token`
        );
        await db.userCallbacks.delete(callback.id);
        cleaned++;
      }

      return {
        success: true,
        message: `Cleaned up ${cleaned} callbacks with expired verification tokens`,
        cleaned,
      };
    } catch (error) {
      console.error(`Error cleaning up expired verifications: ${error}`);
      return {
        success: false,
        message: `Error cleaning up expired verifications: ${error}`,
        cleaned: 0,
      };
    }
  }

  // Send a verification request to a callback URL
  static async sendVerificationRequest(callback: {
    id: string;
    callbackUrl: string;
    verificationToken?: string;
  }): Promise<boolean> {
    try {
      if (!callback.verificationToken) {
        // There was a time when we didn't have token verification
        console.error(`No verification token for callback ${callback.id}`);
        return false;
      }

      // Construct the verification URL
      const verificationUrl = new URL(callback.callbackUrl);
      verificationUrl.searchParams.set("mode", "verify");
      verificationUrl.searchParams.set("token", callback.verificationToken);

      console.log(
        `Sending verification request to ${verificationUrl.toString()} for ${
          callback.id
        }`
      );

      // Send the verification request
      const response = await fetch(verificationUrl.toString(), {
        method: "GET",
        headers: {
          "User-Agent": `SuperDuperFeeder/${config.version}`,
        },
      });

      if (!response.ok) {
        console.error(
          `Verification request failed: ${response.status} ${response.statusText}`
        );
        return false;
      }

      // Check if the response contains the token
      const responseText = await response.text();
      if (responseText.trim() === callback.verificationToken) {
        console.log(`Callback ${callback.id} verified successfully`);
        return true;
      } else {
        console.error(
          `Verification token mismatch for callback ${callback.id}`
        );
        return false;
      }
    } catch (error) {
      console.error(`Error sending verification request: ${error}`);
      return false;
    }
  }

  // Verify a callback using a token
  static async verifyCallback(token: string): Promise<{
    success: boolean;
    message: string;
  }> {
    try {
      const db = await getDatabase();

      // Find all callbacks with this verification token
      const callbacks = await db.userCallbacks.getAll();
      const callback = callbacks.find((c) => c.verificationToken === token);

      if (!callback) {
        return {
          success: false,
          message: "Invalid verification token",
        };
      }

      // Check if the token has expired
      if (
        callback.verificationExpires &&
        callback.verificationExpires < new Date()
      ) {
        return {
          success: false,
          message: "Verification token has expired",
        };
      }

      // Mark the callback as verified
      callback.verified = true;
      callback.verificationToken = undefined;
      callback.verificationExpires = undefined;
      await db.userCallbacks.update(callback);

      return {
        success: true,
        message: "Callback verified successfully",
      };
    } catch (error) {
      console.error(`Error verifying callback: ${error}`);
      return {
        success: false,
        message: `Error verifying callback: ${error}`,
      };
    }
  }
}
