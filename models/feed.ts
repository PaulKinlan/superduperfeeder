// Feed model for RSS/Atom feeds

import { crypto } from "../deps.ts";

// Interface for feed data
export interface Feed {
  id: string;
  url: string; // The URL of the feed
  title?: string; // The title of the feed
  description?: string; // The description of the feed
  lastFetched?: Date; // When the feed was last fetched
  lastUpdated?: Date; // When the feed was last updated (based on content)
  etag?: string; // ETag header for conditional requests
  lastModified?: string; // Last-Modified header for conditional requests
  pollingInterval: number; // How often to poll the feed in minutes
  active: boolean; // Whether the feed is active
  supportsWebSub: boolean; // Whether the feed supports WebSub natively
  webSubHub?: string; // The WebSub hub URL if available
  errorCount: number; // Number of consecutive errors
  lastError?: string; // Last error message
  lastErrorTime?: Date; // When the last error occurred
  lastProcessedEntryId?: string; // ID of the most recently processed entry
}

// Interface for feed item data
export interface FeedItem {
  id: string;
  feedId: string; // The ID of the parent feed
  guid: string; // The unique identifier for the item
  url: string; // The URL of the item
  title: string; // The title of the item
  content?: string; // The content of the item
  summary?: string; // The summary of the item
  author?: string; // The author of the item
  published: Date; // When the item was published
  updated?: Date; // When the item was updated
  categories?: string[]; // Categories/tags for the item
}

// Class for managing feeds in DenoKV
export class FeedStore {
  private kv: Deno.Kv;

  constructor(kv: Deno.Kv) {
    this.kv = kv;
  }

  // Create a new feed
  async create(data: Omit<Feed, "id" | "errorCount">): Promise<Feed> {
    const id = crypto.randomUUID();
    const feed: Feed = {
      id,
      errorCount: 0,
      ...data,
    };

    // Store in KV by ID
    await this.kv.set(["feeds", id], feed);

    // Also create an index by URL
    await this.kv.set(["feeds_by_url", data.url], id);

    return feed;
  }

  // Get a feed by ID
  async getById(id: string): Promise<Feed | null> {
    const result = await this.kv.get<Feed>(["feeds", id]);
    return result.value;
  }

  // Get a feed by URL
  async getByUrl(url: string): Promise<Feed | null> {
    const idResult = await this.kv.get<string>(["feeds_by_url", url]);

    if (!idResult.value) {
      return null;
    }

    return this.getById(idResult.value);
  }

  // Update a feed
  async update(feed: Feed): Promise<void> {
    await this.kv.set(["feeds", feed.id], feed);
  }

  // Delete a feed
  async delete(id: string): Promise<void> {
    const feed = await this.getById(id);
    if (!feed) {
      return;
    }

    // Remove from KV
    await this.kv.delete(["feeds", id]);

    // Remove from index
    await this.kv.delete(["feeds_by_url", feed.url]);
  }

  // Get all feeds
  async getAll(): Promise<Feed[]> {
    const entries = await this.kv.list<Feed>({
      prefix: ["feeds"],
    });

    const feeds: Feed[] = [];
    for await (const entry of entries) {
      feeds.push(entry.value);
    }

    return feeds;
  }

  // Get feeds that need polling
  async getFeedsToUpdate(now: Date): Promise<Feed[]> {
    const allFeeds = await this.getAll();

    return allFeeds.filter((feed) => {
      // Skip inactive feeds
      if (!feed.active) {
        return false;
      }

      // Skip feeds that support WebSub (they'll notify us)
      if (feed.supportsWebSub) {
        return false;
      }

      // If never fetched, include it
      if (!feed.lastFetched && !feed.lastErrorTime) {
        return true;
      }

      // If the feed has errored, use lastErrorTime to determine next poll time
      if (feed.lastErrorTime) {
        const nextPollAfterError = new Date(feed.lastErrorTime);
        nextPollAfterError.setMinutes(
          nextPollAfterError.getMinutes() + feed.pollingInterval,
        );

        // Only poll if the error cooldown period has passed
        if (now < nextPollAfterError) {
          return false;
        }
      }

      // If we have a lastFetched time, check if it's time to poll again
      if (feed.lastFetched) {
        const nextPollTime = new Date(feed.lastFetched);
        nextPollTime.setMinutes(
          nextPollTime.getMinutes() + feed.pollingInterval,
        );

        return now >= nextPollTime;
      }

      // If we reach here, either:
      // 1. The feed has never been fetched but had an error and the error cooldown has passed
      // 2. Some other edge case
      // In either case, it's safe to include it for polling
      return true;
    });
  }

  // Create a new feed item
  async createItem(item: Omit<FeedItem, "id">): Promise<FeedItem> {
    const id = crypto.randomUUID();
    const feedItem: FeedItem = {
      id,
      ...item,
    };

    // Store in KV by ID
    await this.kv.set(["feed_items", id], feedItem);

    // Also create an index by feed ID and GUID
    await this.kv.set(["feed_items_by_feed_guid", item.feedId, item.guid], id);

    return feedItem;
  }

  // Get a feed item by ID
  async getItemById(id: string): Promise<FeedItem | null> {
    const result = await this.kv.get<FeedItem>(["feed_items", id]);
    return result.value;
  }

  // Get a feed item by feed ID and GUID
  async getItemByFeedAndGuid(
    feedId: string,
    guid: string,
  ): Promise<FeedItem | null> {
    const idResult = await this.kv.get<string>([
      "feed_items_by_feed_guid",
      feedId,
      guid,
    ]);

    if (!idResult.value) {
      return null;
    }

    return this.getItemById(idResult.value);
  }

  // Get all items for a feed
  async getItemsByFeed(feedId: string, limit = 50): Promise<FeedItem[]> {
    const entries = await this.kv.list<string>({
      prefix: ["feed_items_by_feed_guid", feedId],
    });

    let count = 0;

    const items: FeedItem[] = [];
    for await (const entry of entries) {
      if (count >= limit) break;

      const item = await this.getItemById(entry.value);
      if (item) {
        items.push(item);
        count++;
      }
    }

    // Sort by published date, newest first
    return items.sort(
      (a, b) => new Date(b.published).getTime() - new Date(a.published).getTime(),
    );
  }

  // Get recent items across all feeds
  async getRecentItems(limit = 50): Promise<FeedItem[]> {
    // This is inefficient but works for now
    // In a real implementation, we'd use a time-based index
    const entries = await this.kv.list<FeedItem>({
      prefix: ["feed_items"],
    });

    const items: FeedItem[] = [];
    for await (const entry of entries) {
      items.push(entry.value);
    }

    // Sort by published date, newest first
    return items
      .sort(
        (a, b) => new Date(b.published).getTime() - new Date(a.published).getTime(),
      )
      .slice(0, limit);
  }
}
