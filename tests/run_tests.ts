#!/usr/bin/env deno run --allow-net --allow-read --allow-env --unstable-kv

// Test runner for SuperDuperFeeder

import { testConfig } from "./test_config.ts";

// Override the config with test config
import { config } from "../config.ts";
Object.assign(config, testConfig);

console.log("Running SuperDuperFeeder tests...");
console.log("Using test configuration:");
console.log(`- Port: ${testConfig.port}`);
console.log(`- Environment: ${testConfig.environment}`);
console.log(`- KV Path: ${testConfig.kvPath || "default"}`);
console.log("");

// Import and run all tests
const testFiles = [
  // Unit tests
  "./unit/feed_model_test.ts",

  // Integration tests
  "./integration/polling_test.ts",
  // Add more test files here as they are created
];

async function runTests() {
  let passed = 0;
  let failed = 0;

  for (const file of testFiles) {
    console.log(`Running tests from ${file}...`);

    try {
      await import(file);
      passed++;
    } catch (error) {
      console.error(`Error running tests from ${file}:`, error);
      failed++;
    }
  }

  console.log("");
  console.log("Test summary:");
  console.log(`- Test files: ${testFiles.length}`);
  console.log(`- Passed: ${passed}`);
  console.log(`- Failed: ${failed}`);

  if (failed > 0) {
    Deno.exit(1);
  }
}

await runTests();
