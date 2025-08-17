/**
 * Generic object pool for reusing common data structures.
 * Reduces memory allocation overhead for frequently used objects.
 */
export class ObjectPool<T> {
  private pool: T[] = [];
  private maxPoolSize: number;
  private factory: () => T;
  private reset: (obj: T) => void;
  private createdCount: number = 0;
  private reusedCount: number = 0;

  constructor(
    factory: () => T,
    reset: (obj: T) => void,
    maxPoolSize: number = 100
  ) {
    this.factory = factory;
    this.reset = reset;
    this.maxPoolSize = maxPoolSize;
  }

  /**
   * Get an object from the pool or create a new one if pool is empty.
   * @returns An object instance (either from pool or newly created)
   */
  public get(): T {
    if (this.pool.length > 0) {
      const obj = this.pool.pop()!;
      this.reset(obj);
      this.reusedCount++;
      return obj;
    } else {
      this.createdCount++;
      return this.factory();
    }
  }

  /**
   * Return an object to the pool for reuse.
   * @param obj - The object to return to the pool
   */
  public return(obj: T): void {
    if (this.pool.length < this.maxPoolSize) {
      this.pool.push(obj);
    }
    // If pool is full, let the object be garbage collected
  }

  /**
   * Get multiple objects at once for batch operations.
   * @param count - Number of objects needed
   * @returns Array of objects
   */
  public getMultiple(count: number): T[] {
    const result: T[] = [];
    for (let i = 0; i < count; i++) {
      result.push(this.get());
    }
    return result;
  }

  /**
   * Return multiple objects to the pool.
   * @param objs - Array of objects to return
   */
  public returnMultiple(objs: T[]): void {
    objs.forEach(obj => this.return(obj));
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

/**
 * Pre-configured object pools for common data structures.
 */
export class CommonPools {
  // Pool for Map objects
  public static readonly mapPool = new ObjectPool<Map<string, any>>(
    () => new Map(),
    (map) => map.clear(),
    200
  );

  // Pool for Array objects
  public static readonly arrayPool = new ObjectPool<any[]>(
    () => [],
    (arr) => arr.length = 0,
    500
  );

  // Pool for Set objects
  public static readonly setPool = new ObjectPool<Set<any>>(
    () => new Set(),
    (set) => set.clear(),
    100
  );

  // Pool for plain objects
  public static readonly objectPool = new ObjectPool<Record<string, any>>(
    () => ({}),
    (obj) => {
      for (const key in obj) {
        delete obj[key];
      }
    },
    300
  );
}

// Export commonly used pools
export const { mapPool, arrayPool, setPool, objectPool } = CommonPools;


