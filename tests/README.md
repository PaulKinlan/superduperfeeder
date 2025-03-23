# SuperDuperFeeder Test Harness

This directory contains the test harness for SuperDuperFeeder, allowing you to run tests locally to
verify the functionality of the application.

## Directory Structure

- `tests/` - Root directory for all tests
  - `unit/` - Unit tests for individual components
  - `integration/` - Integration tests that test multiple components together
  - `mocks/` - Mock implementations for testing
  - `utils/` - Utility functions for testing
  - `run_tests.ts` - Script to run all tests

## Configuration

The test harness uses a separate configuration defined in `test_config.ts`. This configuration
overrides the main application configuration with test-specific settings, such as:

- Using a different port (8001 instead of 8000)
- Using an in-memory KV database
- Using shorter intervals for faster testing
- Setting the environment to "test"

## Running Tests

There are two ways to run the tests:

### Using the Custom Test Runner

To run all tests using our custom test runner, use the following command:

```bash
deno task test
```

This will run all the tests defined in the test files and provide a summary of the results.

### Using Deno's Built-in Test Runner

You can also use Deno's built-in test runner:

```bash
deno task test:deno
```

Or directly:

```bash
deno test --allow-net --allow-read --allow-env --unstable-kv tests/unit/ tests/integration/
```

The built-in test runner provides more detailed output and can be useful for debugging.

## Writing Tests

### Unit Tests

Unit tests focus on testing individual components in isolation. They are located in the `unit/`
directory. Example:

```typescript
// tests/unit/feed_model_test.ts
Deno.test({
  name: "Feed Model - Create Feed",
  async fn() {
    // Test code here
  },
});
```

### Integration Tests

Integration tests focus on testing multiple components working together. They are located in the
`integration/` directory. Example:

```typescript
// tests/integration/polling_test.ts
Deno.test({
  name: "Polling Service - Poll RSS Feed",
  async fn() {
    // Test code here
  },
  sanitizeResources: false,
  sanitizeOps: false,
});
```

### Mocks

The `mocks/` directory contains mock implementations for testing. For example, `mock_feed.ts`
provides utilities for generating mock RSS and Atom feeds, as well as a mock HTTP server for serving
feeds.

### Test Database

The test harness uses a separate database utility defined in `utils/test_database.ts`. This utility
provides functions for initializing and resetting the test database.

## Best Practices

1. **Reset the database before each test**: Use `resetTestDatabase()` at the beginning of each test
   to ensure a clean state.
2. **Use descriptive test names**: Each test should have a clear, descriptive name that indicates
   what it's testing.
3. **Clean up resources**: Use `try/finally` blocks to ensure resources like mock servers are
   cleaned up after tests.
4. **Use assertions**: Use the assertion functions from `https://deno.land/std/testing/asserts.ts`
   to verify test results.
5. **Test edge cases**: Include tests for edge cases and error conditions, not just the happy path.
