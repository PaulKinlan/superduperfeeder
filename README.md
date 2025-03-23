# Super Duper Feeder

A real-time RSS feed subscription service with WebSub/PubSubHubbub and WebHook support.

The Spec compliant WebSub/PubSubHubbub service allows clients to subscribe to RSS feeds and get
notified when new content is available in real-time. The service also supports polling for feeds
that don't support WebSub.

There is also a developer friendly API for real-time updates to RSS feeds delivered directly to a
developer defined endpoint.

## WebSub Concepts

WebSub (formerly PubSubHubbub) is a protocol that enables real-time notifications for content
updates. It involves three main components:

- **Publishers**: Content creators who notify the hub when they update their content
- **Hub**: A server (like Super Duper Feeder) that receives update notifications from publishers and
  forwards them to subscribers
- **Subscribers**: Services or applications that want to receive real-time updates about content
  changes

The flow works as follows:

1. A subscriber discovers the hub URL from a publisher's feed
2. The subscriber sends a subscription request to the hub
3. The hub verifies the subscription request with the subscriber
4. When the publisher updates content, they notify the hub
5. The hub fetches the updated content and sends it to all subscribers

## Features

- WebSub/PubSubHubbub hub functionality
  - Support for both subscription and publishing operations
  - Automatic verification of subscription requests
  - Content distribution to verified subscribers
- RSS feed polling for feeds that don't support WebSub
  - Automatic detection of feed updates
  - Configurable polling intervals
  - Support for conditional GET with ETag and Last-Modified
- Webhook API for real-time updates
  - Automatic hub discovery for feeds
  - Callback verification for security
  - Fallback to polling when WebSub is not supported
- Simple, clean UI with comprehensive documentation
  - Feed subscription management
  - WebSub hub interaction
  - Detailed API documentation

## Technology Stack

- Runtime: Deno
- Hosting: Deno Deploy
- Database: DenoKV
- Scheduling: Deno cron jobs for periodic tasks

## Getting Started

### Local Development

```bash
# Start the server locally
deno task dev
```

The server will be available at http://localhost:8000.

### Testing

The project includes a comprehensive test harness for unit and integration testing:

```bash
# Run all tests
deno task test
```

See the [tests/README.md](tests/README.md) file for more details on the test harness.

### Documentation

The documentation is available at http://localhost:8000/docs when running locally.

### Endpoints

#### WebSub Hub Endpoints

- `POST /` - Main hub endpoint for subscription and publishing operations
- `GET /` - Redirects to the UI

#### Webhook API

- `POST /api/webhook` - Subscribe to a feed using WebSub with automatic hub discovery
- `GET /api/webhook/verify/:token` - Manually verify a callback URL

#### Callback Handling

- `GET/POST /callback/:id` - Handles callbacks from external WebSub hubs

#### UI Endpoints

- `/ui` - Main UI page
- `/ui/subscribe.html` - Feed subscription page
- `/ui/unsubscribe.html` - Feed unsubscription page
- `/ui/subscriptions.html` - Subscription management page

#### Other Endpoints

- `/health` - Health check endpoint
- `/api` - API information endpoint

### Deployment

The service is deployed to Deno Deploy at:
[superduperfeeder.deno.dev](https://superduperfeeder.deno.dev)

## Project Structure

```
/
├── main.ts                 # Entry point
├── config.ts               # Configuration
├── deps.ts                 # Dependencies
├── routes/                 # API routes
│   ├── index.ts            # Main router
│   ├── hub.ts              # WebSub hub endpoints
│   ├── webhook.ts          # Webhook endpoints
│   └── static.ts           # Static file serving
├── services/               # Business logic
│   ├── hub.ts              # WebSub hub service
│   ├── polling.ts          # RSS polling service
│   └── webhook.ts          # Webhook service
├── models/                 # Data models
│   ├── subscription.ts     # Subscription model
│   ├── feed.ts             # Feed model
│   ├── external_subscription.ts # External subscription model
│   ├── user_callback.ts    # User callback model
│   └── user.ts             # User model
├── utils/                  # Utilities
│   ├── database.ts         # Database connection
│   └── crypto.ts           # Password hashing with Web Crypto API
├── tests/                  # Test harness
│   ├── unit/               # Unit tests
│   ├── integration/        # Integration tests
│   ├── mocks/              # Mock implementations
│   ├── utils/              # Test utilities
│   ├── run_tests.ts        # Test runner
│   └── README.md           # Test documentation
└── ui/                     # UI assets
    └── public/             # Public UI assets
        ├── ui/             # Main UI pages
        │   ├── index.html  # Home page
        │   ├── subscribe.html # Subscribe page
        │   ├── unsubscribe.html # Unsubscribe page
        │   ├── subscriptions.html # Manage subscriptions page
        │   └── styles.css  # UI styles
        └── docs/           # Documentation
            ├── index.html  # Documentation page
            └── styles.css  # Documentation styles
```

## API Documentation

The service provides a comprehensive API for interacting with the WebSub hub and managing feed
subscriptions:

### WebSub Hub API

- Subscribe to updates from a feed
- Unsubscribe from a feed
- Publish updates to subscribers

### Webhook API

- Subscribe to a feed with automatic hub discovery
- Verify callback URLs for security
- Receive real-time updates via callbacks

### Callback Verification

- Automatic verification of subscription requests
- Token-based verification for callbacks

See the [documentation](https://superduperfeeder.deno.dev/docs) for detailed API usage, including
request/response formats, error handling, and best practices.

## Deno Deploy Compatibility

### Password Hashing

This project uses the Web Crypto API for password hashing instead of bcrypt because bcrypt is not
compatible with Deno Deploy. The implementation in `utils/crypto.ts` provides:

- Secure password hashing using PBKDF2 with SHA-256
- AES-GCM encryption for password verification
- A drop-in replacement for bcrypt's `hash` and `compare` functions
- Automatic salt generation for each password
- Compatibility with the existing user authentication system

The implementation has been thoroughly tested and provides the same level of security as bcrypt
while being compatible with Deno Deploy's runtime environment.

## License

See the [LICENSE](LICENSE) file for details.
