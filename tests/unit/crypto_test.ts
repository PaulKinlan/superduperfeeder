// Tests for the Web Crypto API password hashing implementation

import { compare, hash } from "../../utils/crypto.ts";
import { assertEquals } from "@std/assert";

Deno.test("Crypto hash and compare - successful match", async () => {
  const password = "test-password";

  // Hash the password
  const hashedPassword = await hash(password);

  // Verify the hash has our prefix
  assertEquals(hashedPassword.startsWith("WEBCRYPTO$"), true);

  // Verify the password matches the hash
  const isMatch = await compare(password, hashedPassword);
  assertEquals(isMatch, true);
});

Deno.test("Crypto hash and compare - failed match", async () => {
  const password = "test-password";
  const wrongPassword = "wrong-password";

  // Hash the password
  const hashedPassword = await hash(password);

  // Verify the wrong password doesn't match
  const isMatch = await compare(wrongPassword, hashedPassword);
  assertEquals(isMatch, false);
});

Deno.test("Crypto hash - different salts for same password", async () => {
  const password = "same-password";

  // Hash the password twice
  const hash1 = await hash(password);
  const hash2 = await hash(password);

  // Verify the hashes are different (due to different salts)
  assertEquals(hash1 !== hash2, true);

  // But both should verify correctly
  const isMatch1 = await compare(password, hash1);
  const isMatch2 = await compare(password, hash2);
  assertEquals(isMatch1, true);
  assertEquals(isMatch2, true);
});

Deno.test("Crypto compare - rejects old bcrypt format", async () => {
  const password = "test-password";
  // This is a fake bcrypt hash format
  const oldHash = "$2a$10$zYBQgLj.1qfUDBgJqCq80eJ1vNjFvFYFDZNgRqPc1JLRsV8qBRpHK";

  // Verify the compare function rejects the old format
  const isMatch = await compare(password, oldHash);
  assertEquals(isMatch, false);
});
