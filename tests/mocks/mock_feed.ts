// Mock RSS feed for testing

// Generate a mock RSS feed
export function generateMockRssFeed(
  options: {
    title?: string;
    description?: string;
    link?: string;
    items?: number;
    webSubHub?: boolean;
  } = {},
): string {
  const title = options.title || "Test Feed";
  const description = options.description || "A test feed for unit testing";
  const link = options.link || "https://example.com/feed";
  const itemCount = options.items || 5;
  const includeWebSubHub = options.webSubHub ?? false;

  let feed = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">
  <channel>
    <title>${title}</title>
    <description>${description}</description>
    <link>${link}</link>
    <atom:link href="${link}" rel="self" type="application/rss+xml" />`;

  // Add WebSub hub link if requested
  if (includeWebSubHub) {
    feed += `
    <atom:link href="https://pubsubhubbub.appspot.com" rel="hub" />`;
  }

  // Generate items
  for (let i = 0; i < itemCount; i++) {
    const pubDate = new Date();
    pubDate.setDate(pubDate.getDate() - i); // Each item is a day older

    feed += `
    <item>
      <title>Test Item ${i + 1}</title>
      <description>This is test item ${i + 1}</description>
      <link>${link}/item${i + 1}</link>
      <guid>${link}/item${i + 1}</guid>
      <pubDate>${pubDate.toUTCString()}</pubDate>
      <category>test</category>
    </item>`;
  }

  feed += `
  </channel>
</rss>`;

  return feed;
}

// Generate a mock Atom feed
export function generateMockAtomFeed(
  options: {
    title?: string;
    subtitle?: string;
    link?: string;
    entries?: number;
    webSubHub?: boolean;
  } = {},
): string {
  const title = options.title || "Test Feed";
  const subtitle = options.subtitle || "A test feed for unit testing";
  const link = options.link || "https://example.com/feed";
  const entryCount = options.entries || 5;
  const includeWebSubHub = options.webSubHub ?? false;

  let feed = `<?xml version="1.0" encoding="UTF-8"?>
<feed xmlns="http://www.w3.org/2005/Atom">
  <title>${title}</title>
  <subtitle>${subtitle}</subtitle>
  <link href="${link}" rel="self" />
  <link href="https://example.com/" />
  <id>${link}</id>
  <updated>${new Date().toISOString()}</updated>`;

  // Add WebSub hub link if requested
  if (includeWebSubHub) {
    feed += `
  <link href="https://pubsubhubbub.appspot.com" rel="hub" />`;
  }

  // Generate entries
  for (let i = 0; i < entryCount; i++) {
    const updated = new Date();
    updated.setDate(updated.getDate() - i); // Each entry is a day older

    feed += `
  <entry>
    <title>Test Entry ${i + 1}</title>
    <link href="${link}/entry${i + 1}" />
    <id>${link}/entry${i + 1}</id>
    <updated>${updated.toISOString()}</updated>
    <content type="html">This is test entry ${i + 1}</content>
    <author>
      <name>Test Author</name>
    </author>
    <category term="test" />
  </entry>`;
  }

  feed += `
</feed>`;

  return feed;
}

// Mock HTTP server for serving feeds
export class MockFeedServer {
  private feeds: Map<
    string,
    {
      content: string;
      etag?: string;
      lastModified?: string;
      contentType: string;
    }
  > = new Map();

  private port: number;
  private controller = new AbortController();
  private server: Deno.HttpServer | null = null;

  constructor(port = 8080) {
    this.port = port;
  }

  // Add a feed to the server
  addFeed(path: string, content: string, contentType = "application/xml") {
    const etag = `"${crypto.randomUUID()}"`;
    const lastModified = new Date().toUTCString();

    this.feeds.set(path, {
      content,
      etag,
      lastModified,
      contentType,
    });
  }

  // Update a feed
  updateFeed(path: string, content: string) {
    const feed = this.feeds.get(path);
    if (!feed) {
      throw new Error(`Feed not found: ${path}`);
    }

    feed.content = content;
    feed.etag = `"${crypto.randomUUID()}"`;
    feed.lastModified = new Date().toUTCString();
  }

  // Start the server
  async start(): Promise<void> {
    const { signal } = this.controller;

    this.server = Deno.serve({
      port: this.port,
      signal,
      handler: (request) => {
        const url = new URL(request.url);
        const path = url.pathname;

        const feed = this.feeds.get(path);
        if (!feed) {
          return new Response("Not Found", { status: 404 });
        }

        // Check for conditional GET
        const ifNoneMatch = request.headers.get("If-None-Match");
        const ifModifiedSince = request.headers.get("If-Modified-Since");

        if (
          (ifNoneMatch && ifNoneMatch === feed.etag) ||
          (ifModifiedSince &&
            feed.lastModified &&
            new Date(ifModifiedSince) >= new Date(feed.lastModified))
        ) {
          return new Response(null, { status: 304 });
        }

        // Return the feed
        return new Response(feed.content, {
          status: 200,
          headers: {
            "Content-Type": feed.contentType,
            ETag: feed.etag || "",
            "Last-Modified": feed.lastModified || "",
          },
        });
      },
    });

    console.log(`Mock feed server running on http://localhost:${this.port}`);
  }

  // Stop the server
  async stop(): Promise<void> {
    this.controller.abort();
    this.server = null;
    console.log("Mock feed server stopped");
  }
}
