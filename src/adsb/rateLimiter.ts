/**
 * Simple global token-bucket limiter shared by all outbound ADS-B API calls.
 * Community feeds (adsb.lol / adsb.fi) ask for polite, low-rate usage — this
 * keeps the bot well under that regardless of how many flights are tracked.
 */
export class TokenBucket {
  private tokens: number;
  private readonly capacity: number;
  private readonly refillPerMs: number;
  private lastRefill: number;

  constructor(ratePerSecond: number) {
    this.capacity = Math.max(1, Math.ceil(ratePerSecond));
    this.tokens = this.capacity;
    this.refillPerMs = ratePerSecond / 1000;
    this.lastRefill = Date.now();
  }

  private refill(): void {
    const now = Date.now();
    const elapsed = now - this.lastRefill;
    if (elapsed <= 0) return;
    this.tokens = Math.min(this.capacity, this.tokens + elapsed * this.refillPerMs);
    this.lastRefill = now;
  }

  async take(): Promise<void> {
    for (;;) {
      this.refill();
      if (this.tokens >= 1) {
        this.tokens -= 1;
        return;
      }
      const waitMs = Math.max(10, (1 - this.tokens) / this.refillPerMs);
      await new Promise((resolve) => setTimeout(resolve, waitMs));
    }
  }
}
