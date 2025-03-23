// Unit tests for the Feed model

import { assertEquals, assertExists, assertNotEquals } from "@std/assert";
import { closeTestDatabase, getTestDatabase, resetTestDatabase } from "../utils/test_database.ts";

// Import test setup to configure the environment
import "../test_setup.ts";

Deno.test({
  name: "Feed Model - Create Feed",
  sanitizeResources: false,
  async fn() {
    // Reset the database
    await resetTestDatabase();
    const db = await getTestDatabase();

    try {
      // Create a feed
      const feed = await db.feeds.create({
        url: "https://example.com/feed.xml",
        title: "Test Feed",
        description: "A test feed",
        pollingInterval: 60,
        active: true,
        supportsWebSub: false,
      });

      // Verify the feed was created
      assertExists(feed);
      assertExists(feed.id);
      assertEquals(feed.url, "https://example.com/feed.xml");
      assertEquals(feed.title, "Test Feed");
      assertEquals(feed.description, "A test feed");
      assertEquals(feed.pollingInterval, 60);
      assertEquals(feed.active, true);
      assertEquals(feed.supportsWebSub, false);
      assertEquals(feed.errorCount, 0);
    } finally {
      // Close the database connection
      await closeTestDatabase(db);
    }
  },
});

Deno.test({
  name: "Feed Model - Get Feed By ID",
  sanitizeResources: false,
  async fn() {
    // Reset the database
    await resetTestDatabase();
    const db = await getTestDatabase();

    try {
      // Create a feed
      const feed = await db.feeds.create({
        url: "https://example.com/feed.xml",
        title: "Test Feed",
        pollingInterval: 60,
        active: true,
        supportsWebSub: false,
      });

      // Get the feed by ID
      const retrievedFeed = await db.feeds.getById(feed.id);

      // Verify the feed was retrieved
      assertExists(retrievedFeed);
      if (retrievedFeed) {
        assertEquals(retrievedFeed.id, feed.id);
        assertEquals(retrievedFeed.url, feed.url);
        assertEquals(retrievedFeed.title, feed.title);
      }
    } finally {
      // Close the database connection
      await closeTestDatabase(db);
    }
  },
});

Deno.test({
  name: "Feed Model - Get Feed By URL",
  sanitizeResources: false,
  async fn() {
    // Reset the database
    await resetTestDatabase();
    const db = await getTestDatabase();

    try {
      // Create a feed
      const feedUrl = "https://example.com/unique-feed.xml";
      const feed = await db.feeds.create({
        url: feedUrl,
        title: "Unique Feed",
        pollingInterval: 60,
        active: true,
        supportsWebSub: false,
      });

      // Get the feed by URL
      const retrievedFeed = await db.feeds.getByUrl(feedUrl);

      // Verify the feed was retrieved
      assertExists(retrievedFeed);
      if (retrievedFeed) {
        assertEquals(retrievedFeed.id, feed.id);
        assertEquals(retrievedFeed.url, feedUrl);
        assertEquals(retrievedFeed.title, feed.title);
      }
    } finally {
      // Close the database connection
      await closeTestDatabase(db);
    }
  },
});

Deno.test({
  name: "Feed Model - Update Feed",
  sanitizeResources: false,
  async fn() {
    // Reset the database
    await resetTestDatabase();
    const db = await getTestDatabase();

    try {
      // Create a feed
      const feed = await db.feeds.create({
        url: "https://example.com/feed.xml",
        title: "Original Title",
        pollingInterval: 60,
        active: true,
        supportsWebSub: false,
      });

      // Update the feed
      feed.title = "Updated Title";
      feed.description = "Updated description";
      feed.pollingInterval = 30;

      await db.feeds.update(feed);

      // Get the updated feed
      const updatedFeed = await db.feeds.getById(feed.id);

      // Verify the feed was updated
      assertExists(updatedFeed);
      if (updatedFeed) {
        assertEquals(updatedFeed.title, "Updated Title");
        assertEquals(updatedFeed.description, "Updated description");
        assertEquals(updatedFeed.pollingInterval, 30);
      }
    } finally {
      // Close the database connection
      await closeTestDatabase(db);
    }
  },
});

Deno.test({
  name: "Feed Model - Delete Feed",
  sanitizeResources: false,
  async fn() {
    // Reset the database
    await resetTestDatabase();
    const db = await getTestDatabase();

    try {
      // Create a feed
      const feed = await db.feeds.create({
        url: "https://example.com/feed-to-delete.xml",
        title: "Feed to Delete",
        pollingInterval: 60,
        active: true,
        supportsWebSub: false,
      });

      // Verify the feed exists
      const feedBeforeDelete = await db.feeds.getById(feed.id);
      assertExists(feedBeforeDelete);

      // Delete the feed
      await db.feeds.delete(feed.id);

      // Verify the feed was deleted
      const feedAfterDelete = await db.feeds.getById(feed.id);
      assertEquals(feedAfterDelete, null);
    } finally {
      // Close the database connection
      await closeTestDatabase(db);
    }
  },
});

Deno.test({
  name: "Feed Model - Get Feeds To Update",
  sanitizeResources: false,
  async fn() {
    // Reset the database
    await resetTestDatabase();
    const db = await getTestDatabase();

    try {
      // Create feeds with different states
      const now = new Date();

      // Feed 1: Active, no WebSub, never fetched (should be updated)
      await db.feeds.create({
        url: "https://example.com/feed1.xml",
        title: "Feed 1",
        pollingInterval: 60,
        active: true,
        supportsWebSub: false,
      });

      // Feed 2: Active, no WebSub, fetched recently (should not be updated)
      const feed2 = await db.feeds.create({
        url: "https://example.com/feed2.xml",
        title: "Feed 2",
        pollingInterval: 60,
        active: true,
        supportsWebSub: false,
      });

      const recentTime = new Date(now);
      recentTime.setMinutes(recentTime.getMinutes() - 30); // 30 minutes ago
      feed2.lastFetched = recentTime;
      await db.feeds.update(feed2);

      // Feed 3: Active, no WebSub, fetched long ago (should be updated)
      const feed3 = await db.feeds.create({
        url: "https://example.com/feed3.xml",
        title: "Feed 3",
        pollingInterval: 60,
        active: true,
        supportsWebSub: false,
      });

      const oldTime = new Date(now);
      oldTime.setMinutes(oldTime.getMinutes() - 120); // 2 hours ago
      feed3.lastFetched = oldTime;
      await db.feeds.update(feed3);

      // Feed 4: Inactive (should not be updated)
      await db.feeds.create({
        url: "https://example.com/feed4.xml",
        title: "Feed 4",
        pollingInterval: 60,
        active: false,
        supportsWebSub: false,
      });

      // Feed 5: Supports WebSub (should not be updated)
      await db.feeds.create({
        url: "https://example.com/feed5.xml",
        title: "Feed 5",
        pollingInterval: 60,
        active: true,
        supportsWebSub: true,
        webSubHub: "https://pubsubhubbub.appspot.com",
      });

      // Get feeds to update
      const feedsToUpdate = await db.feeds.getFeedsToUpdate(now);

      // Verify the correct feeds were returned
      assertEquals(feedsToUpdate.length, 2); // Should be Feed 1 and Feed 3

      // Check that the feeds are the ones we expect
      const urls = feedsToUpdate.map((feed) => feed.url).sort();
      assertEquals(
        urls,
        [
          "https://example.com/feed1.xml",
          "https://example.com/feed3.xml",
        ].sort(),
      );
    } finally {
      // Close the database connection
      await closeTestDatabase(db);
    }
  },
});

Deno.test({
  name: "Feed Model - Feed Items",
  sanitizeResources: false,
  async fn() {
    // Reset the database
    await resetTestDatabase();
    const db = await getTestDatabase();

    try {
      // Create a feed
      const feed = await db.feeds.create({
        url: "https://example.com/feed-with-items.xml",
        title: "Feed with Items",
        pollingInterval: 60,
        active: true,
        supportsWebSub: false,
      });

      // Create feed items
      const now = new Date();

      // Item 1
      const item1 = await db.feeds.createItem({
        feedId: feed.id,
        guid: "item1",
        url: "https://example.com/item1",
        title: "Item 1",
        content: "Content of item 1",
        published: now,
      });

      // Item 2 (older)
      const yesterday = new Date(now);
      yesterday.setDate(yesterday.getDate() - 1);

      const item2 = await db.feeds.createItem({
        feedId: feed.id,
        guid: "item2",
        url: "https://example.com/item2",
        title: "Item 2",
        content: "Content of item 2",
        published: yesterday,
      });

      // Get items by feed
      const items = await db.feeds.getItemsByFeed(feed.id);

      // Verify items were retrieved and sorted correctly (newest first)
      assertEquals(items.length, 2);
      assertEquals(items[0].guid, "item1"); // Newest should be first
      assertEquals(items[1].guid, "item2");

      // Get item by feed and guid
      const retrievedItem = await db.feeds.getItemByFeedAndGuid(
        feed.id,
        "item1",
      );
      assertExists(retrievedItem);
      if (retrievedItem) {
        assertEquals(retrievedItem.id, item1.id);
        assertEquals(retrievedItem.title, "Item 1");
      }
    } finally {
      // Close the database connection
      await closeTestDatabase(db);
    }
  },
});
