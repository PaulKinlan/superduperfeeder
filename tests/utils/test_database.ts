// Test database utilities

import { testConfig } from "../test_config.ts";
import { getDatabase } from "../../utils/database.ts";
import type { Database } from "../../utils/database.ts";

// Keep a single instance of the database for all tests
let dbInstance: Database | null = null;

// Initialize test data
async function initTestData(db: Database): Promise<void> {
  // Initialize the admin user
  await db.users.initAdminUser(testConfig.admin.username, "test-password");

  // Add any other test data initialization here
}

// Reset the test database
export async function resetTestDatabase(): Promise<void> {
  // Get the database instance
  const db = await getTestDatabase();

  try {
    // Delete the admin user if it exists
    const adminUser = await db.users.getByUsername(testConfig.admin.username);
    if (adminUser) {
      await db.users.delete(adminUser.id);
    }

    // Re-initialize test data
    await initTestData(db);
  } catch (error: unknown) {
    console.error("Error resetting database:", error);

    // If we get a BadResource error, the database connection might be closed
    // Let's try to recreate it
    if (error instanceof Error && error.message.includes("BadResource")) {
      dbInstance = null;
      await getTestDatabase();
    }
  }
}

// Get the test database instance
export async function getTestDatabase(): Promise<Database> {
  if (!dbInstance) {
    dbInstance = await getDatabase();

    // Initialize test data
    try {
      const adminUser = await dbInstance.users.getByUsername(
        testConfig.admin.username
      );
      if (!adminUser) {
        await initTestData(dbInstance);
      }
    } catch (error: unknown) {
      console.error("Error initializing test data:", error);
    }
  }

  return dbInstance;
}

// Close the database connection
export async function closeTestDatabase(db: Database): Promise<void> {
  // In the test environment, we'll keep the database connection open
  // to avoid "BadResource" errors when running multiple tests
  // The connection will be closed when the process exits

  // Only close the connection if we're explicitly told to
  if (Deno.env.get("CLOSE_DB_AFTER_TEST") === "true") {
    try {
      // @ts-ignore - Accessing private method
      await db.close();
      dbInstance = null;
    } catch (error: unknown) {
      console.error("Error closing database:", error);
    }
  }
}
