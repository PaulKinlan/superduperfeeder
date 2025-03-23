const db = await Deno.openKv("https://api.deno.com/databases/[insert]/connect");
const deleteData = async (prefix) => {
  const entries = db.list({ prefix });
  for await (const entry of entries) {
    console.log(entry);
    db.delete(entry.key);
  }
};
await deleteData(["user_callbacks"]);
await deleteData(["external_subscriptions_by_callback"]);
await deleteData(["external_subscriptions_by_topic"]);
await deleteData(["user_callbacks_by_topic_url"]);
await deleteData(["users"]);
await deleteData(["users_by_username"]);
await deleteData(["external_subscriptions"]);
