import { bigNumberPool } from '../utils/BigNumberPool';
import { mapPool, arrayPool, setPool, objectPool } from '../utils/ObjectPool';

/**
 * Memory monitoring system for tracking performance and resource usage.
 * Provides insights into memory allocation patterns and object pool efficiency.
 */
export class MemoryMonitor {
  private static instance: MemoryMonitor;
  private startTime: number = Date.now();
  private lastReportTime: number = Date.now();
  private reportInterval: number = 60000; // Report every minute
  private isMonitoring: boolean = false;
  private intervalId?: NodeJS.Timeout;

  private constructor() {}

  public static getInstance(): MemoryMonitor {
    if (!MemoryMonitor.instance) {
      MemoryMonitor.instance = new MemoryMonitor();
    }
    return MemoryMonitor.instance;
  }

  /**
   * Start memory monitoring with periodic reports.
   */
  public startMonitoring(): void {
    if (this.isMonitoring) return;
    
    this.isMonitoring = true;
    this.intervalId = setInterval(() => {
      this.generateReport();
    }, this.reportInterval);
    
    console.log('🔍 Memory monitoring started');
  }

  /**
   * Stop memory monitoring.
   */
  public stopMonitoring(): void {
    if (!this.isMonitoring) return;
    
    this.isMonitoring = false;
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = undefined;
    }
    
    console.log('🛑 Memory monitoring stopped');
  }

  /**
   * Generate a comprehensive memory usage report.
   */
  public generateReport(): void {
    const now = Date.now();
    const uptime = now - this.startTime;
    const timeSinceLastReport = now - this.lastReportTime;
    
    const report = {
      timestamp: new Date().toISOString(),
      uptime: this.formatDuration(uptime),
      timeSinceLastReport: this.formatDuration(timeSinceLastReport),
      systemMemory: this.getSystemMemoryInfo(),
      objectPools: {
        bigNumber: bigNumberPool.getStats(),
        map: mapPool.getStats(),
        array: arrayPool.getStats(),
        set: setPool.getStats(),
        object: objectPool.getStats()
      },
      recommendations: this.generateRecommendations()
    };

    console.log('📊 Memory Usage Report:');
    console.log(JSON.stringify(report, null, 2));
    
    this.lastReportTime = now;
  }

  /**
   * Get current system memory information.
   */
  private getSystemMemoryInfo(): any {
    if (typeof process !== 'undefined' && process.memoryUsage) {
      const memUsage = process.memoryUsage();
      return {
        rss: this.formatBytes(memUsage.rss),
        heapTotal: this.formatBytes(memUsage.heapTotal),
        heapUsed: this.formatBytes(memUsage.heapUsed),
        external: this.formatBytes(memUsage.external),
        arrayBuffers: this.formatBytes(memUsage.arrayBuffers || 0)
      };
    }
    return { error: 'Memory usage not available' };
  }

  /**
   * Generate optimization recommendations based on current metrics.
   */
  private generateRecommendations(): string[] {
    const recommendations: string[] = [];
    const bigNumberStats = bigNumberPool.getStats();
    const mapStats = mapPool.getStats();

    // BigNumber pool recommendations
    if (bigNumberStats.reuseRate < 50) {
      recommendations.push('⚠️ BigNumber reuse rate is low. Consider increasing pool size or optimizing usage patterns.');
    }
    if (bigNumberStats.poolSize < bigNumberStats.maxPoolSize * 0.1) {
      recommendations.push('💡 BigNumber pool is underutilized. Consider reducing max pool size to save memory.');
    }

    // Map pool recommendations
    if (mapStats.reuseRate < 30) {
      recommendations.push('⚠️ Map reuse rate is low. Consider increasing pool size or optimizing usage patterns.');
    }

    // System memory recommendations
    const memUsage = process.memoryUsage();
    const heapUsedPercent = (memUsage.heapUsed / memUsage.heapTotal) * 100;
    
    if (heapUsedPercent > 80) {
      recommendations.push('🚨 High heap memory usage detected. Consider implementing more aggressive object pooling.');
    } else if (heapUsedPercent > 60) {
      recommendations.push('⚠️ Moderate heap memory usage. Monitor for memory leaks.');
    }

    if (recommendations.length === 0) {
      recommendations.push('✅ Memory usage is optimal. No immediate action required.');
    }

    return recommendations;
  }

  /**
   * Format bytes into human-readable format.
   */
  private formatBytes(bytes: number): string {
    if (bytes === 0) return '0 B';
    
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  }

  /**
   * Format duration in milliseconds to human-readable format.
   */
  private formatDuration(ms: number): string {
    const seconds = Math.floor(ms / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);

    if (days > 0) return `${days}d ${hours % 24}h ${minutes % 60}m`;
    if (hours > 0) return `${hours}h ${minutes % 60}m`;
    if (minutes > 0) return `${minutes}m ${seconds % 60}s`;
    return `${seconds}s`;
  }

  /**
   * Get a quick snapshot of current memory status.
   */
  public getQuickStatus(): any {
    return {
      isMonitoring: this.isMonitoring,
      uptime: this.formatDuration(Date.now() - this.startTime),
      systemMemory: this.getSystemMemoryInfo(),
      objectPoolEfficiency: {
        bigNumber: bigNumberPool.getStats().reuseRate.toFixed(1) + '%',
        map: mapPool.getStats().reuseRate.toFixed(1) + '%',
        array: arrayPool.getStats().reuseRate.toFixed(1) + '%'
      }
    };
  }

  /**
   * Set the report interval.
   * @param intervalMs - Interval in milliseconds
   */
  public setReportInterval(intervalMs: number): void {
    this.reportInterval = Math.max(1000, intervalMs); // Minimum 1 second
    
    if (this.isMonitoring) {
      this.stopMonitoring();
      this.startMonitoring();
    }
  }
}

// Export singleton instance
export const memoryMonitor = MemoryMonitor.getInstance();


