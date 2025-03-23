Project Name: Super Duper Feeder

Description: A Spec compliant WebSub/PubSubHubbub service that allows users to subscribe to RSS
feeds and get notified when new content is available.

UI: The UI should be a simple page that describes how to use the REST endpoints

Technology Stack:

- Runtime: Deno
- Hosting: Deno Deploy.
- Project ID on Deno Deploy: superduperfeeder
- Live URL: superduperfeeder.deno.dev
- Database: DenoKV, a key-value store that is part of Deno Deploy.
- Queue: Deno Deploy's built-in queue system.

Features:

- There should also be an Admin UI that makes it easy to manage the entire system.
- There should be a firehose endpoint that allows users to get all the updates in real-time.
