export class Queue {
  private kv: Deno.Kv;

  constructor(kv: Deno.Kv) {
    this.kv = kv;
  }

  async enqueue(
    data: any,
    options?: {
      delay?: number;
      keysIfUndelivered?: Deno.KvKey[];
      backoffSchedule?: number[];
    }
  ): Promise<void> {
    await this.kv.enqueue(data, options);
  }
}
