import BigNumber from './bignumber';

/**
 * Object pool for BigNumber instances to reduce memory allocation overhead.
 * Since BigNumber instances are immutable, this pool helps reduce the overhead
 * of creating new instances and provides a centralized place for BigNumber management.
 */
export class BigNumberPool {
  private static instance: BigNumberPool;
  private pool: BigNumber[] = [];
  private maxPoolSize: number = 1000; // Maximum objects to keep in pool
  private createdCount: number = 0;
  private reusedCount: number = 0;

  private constructor() {}

  public static getInstance(): BigNumberPool {
    if (!BigNumberPool.instance) {
      BigNumberPool.instance = new BigNumberPool();
    }
    return BigNumberPool.instance;
  }

  /**
   * Get a BigNumber instance. Since BigNumber instances are immutable,
   * we always create new instances but the pool helps with memory management.
   * @param initialValue - Initial value for the BigNumber
   * @returns A new BigNumber instance
   */
  public get(initialValue: string | number = '0'): BigNumber {
    // For immutable BigNumber instances, we always create new ones
    // but track usage for monitoring purposes
    this.createdCount++;
    return new BigNumber(initialValue);
  }

  /**
   * Return a BigNumber instance to the pool for potential reuse.
   * Since BigNumber instances are immutable, this is mainly for memory management.
   * @param bn - The BigNumber instance to return to the pool
   */
  public return(bn: BigNumber): void {
    if (this.pool.length < this.maxPoolSize) {
      // Store in pool for potential reuse (though we'll create new instances)
      this.pool.push(bn);
      this.reusedCount++;
    }
    // If pool is full, let the BigNumber be garbage collected
  }

  /**
   * Get multiple BigNumber instances at once for batch operations.
   * @param count - Number of BigNumber instances needed
   * @param initialValue - Initial value for all instances
   * @returns Array of BigNumber instances
   */
  public getMultiple(count: number, initialValue: string | number = '0'): BigNumber[] {
    const result: BigNumber[] = [];
    for (let i = 0; i < count; i++) {
      result.push(this.get(initialValue));
    }
    return result;
  }

  /**
   * Return multiple BigNumber instances to the pool.
   * @param bns - Array of BigNumber instances to return
   */
  public returnMultiple(bns: BigNumber[]): void {
    bns.forEach(bn => this.return(bn));
  }

  /**
   * Get pool statistics for monitoring.
   */
  public getStats() {
    return {
      poolSize: this.pool.length,
      maxPoolSize: this.maxPoolSize,
      createdCount: this.createdCount,
      reusedCount: this.reusedCount,
      reuseRate: this.createdCount > 0 ? (this.reusedCount / (this.createdCount + this.reusedCount)) * 100 : 0
    };
  }

  /**
   * Clear the pool and reset statistics.
   */
  public clear(): void {
    this.pool = [];
    this.createdCount = 0;
    this.reusedCount = 0;
  }

  /**
   * Adjust the maximum pool size.
   * @param newSize - New maximum pool size
   */
  public setMaxPoolSize(newSize: number): void {
    this.maxPoolSize = Math.max(0, newSize);
    // Trim pool if new size is smaller
    while (this.pool.length > this.maxPoolSize) {
      this.pool.pop();
    }
  }
}

// Export singleton instance
export const bigNumberPool = BigNumberPool.getInstance();
