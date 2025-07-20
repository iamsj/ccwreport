// Integration tests for data collection orchestration

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { DataSourceManager } from '../data-source-manager';
import { GitDataSource } from '../git-data-source';
import {
  DataSource,
  DataSourceConfig,
  DataSourceError,
  DataSourceConnectionError,
  DataSourceCollectionError,
} from '../../models/data-source';
import { TimeRange, CollectedData, ValidationResult, GitCommit } from '../../models/config';

// Mock data sources for integration testing
class FastMockDataSource implements DataSource {
  readonly type = 'fast-mock';
  readonly name = 'Fast Mock Data Source';
  readonly version = '1.0.0';

  async collect(config: DataSourceConfig, timeRange: TimeRange): Promise<CollectedData> {
    // Simulate fast data collection (50ms)
    await new Promise(resolve => setTimeout(resolve, 50));
    
    return {
      source: `${this.type}:${config.name}`,
      timeRange,
      data: [
        {
          hash: 'fast-hash-1',
          author: 'Fast Author',
          date: new Date(),
          message: 'Fast commit message',
          filesChanged: ['fast-file.ts'],
          additions: 5,
          deletions: 2,
        },
      ],
    };
  }

  validate(config: DataSourceConfig): ValidationResult {
    return { isValid: true, errors: [] };
  }

  async testConnection(config: DataSourceConfig): Promise<boolean> {
    return true;
  }

  getConfigSchema() {
    return {
      $schema: 'http://json-schema.org/draft-07/schema#',
      type: 'object' as const,
      required: ['type', 'enabled', 'name'],
      properties: {
        type: { type: 'string', const: 'fast-mock' },
        enabled: { type: 'boolean' },
        name: { type: 'string' },
      },
      additionalProperties: false,
    };
  }
}

class SlowMockDataSource implements DataSource {
  readonly type = 'slow-mock';
  readonly name = 'Slow Mock Data Source';
  readonly version = '1.0.0';

  async collect(config: DataSourceConfig, timeRange: TimeRange): Promise<CollectedData> {
    // Simulate slow data collection (500ms)
    await new Promise(resolve => setTimeout(resolve, 500));
    
    return {
      source: `${this.type}:${config.name}`,
      timeRange,
      data: [
        {
          hash: 'slow-hash-1',
          author: 'Slow Author',
          date: new Date(),
          message: 'Slow commit message',
          filesChanged: ['slow-file.ts'],
          additions: 15,
          deletions: 8,
        },
      ],
    };
  }

  validate(config: DataSourceConfig): ValidationResult {
    return { isValid: true, errors: [] };
  }

  async testConnection(config: DataSourceConfig): Promise<boolean> {
    return true;
  }

  getConfigSchema() {
    return {
      $schema: 'http://json-schema.org/draft-07/schema#',
      type: 'object' as const,
      required: ['type', 'enabled', 'name'],
      properties: {
        type: { type: 'string', const: 'slow-mock' },
        enabled: { type: 'boolean' },
        name: { type: 'string' },
      },
      additionalProperties: false,
    };
  }
}

class UnreliableMockDataSource implements DataSource {
  readonly type = 'unreliable-mock';
  readonly name = 'Unreliable Mock Data Source';
  readonly version = '1.0.0';
  
  private attemptCount = 0;

  async collect(config: DataSourceConfig, timeRange: TimeRange): Promise<CollectedData> {
    this.attemptCount++;
    
    // Fail on first two attempts, succeed on third
    if (this.attemptCount <= 2) {
      throw new Error(`Attempt ${this.attemptCount} failed`);
    }
    
    return {
      source: `${this.type}:${config.name}`,
      timeRange,
      data: [
        {
          hash: 'unreliable-hash-1',
          author: 'Unreliable Author',
          date: new Date(),
          message: 'Finally successful commit',
          filesChanged: ['unreliable-file.ts'],
          additions: 20,
          deletions: 10,
        },
      ],
    };
  }

  validate(config: DataSourceConfig): ValidationResult {
    return { isValid: true, errors: [] };
  }

  async testConnection(config: DataSourceConfig): Promise<boolean> {
    return true;
  }

  getConfigSchema() {
    return {
      $schema: 'http://json-schema.org/draft-07/schema#',
      type: 'object' as const,
      required: ['type', 'enabled', 'name'],
      properties: {
        type: { type: 'string', const: 'unreliable-mock' },
        enabled: { type: 'boolean' },
        name: { type: 'string' },
      },
      additionalProperties: false,
    };
  }

  resetAttempts() {
    this.attemptCount = 0;
  }
}

class FailingMockDataSource implements DataSource {
  readonly type = 'failing-mock';
  readonly name = 'Failing Mock Data Source';
  readonly version = '1.0.0';

  async collect(config: DataSourceConfig, timeRange: TimeRange): Promise<CollectedData> {
    throw new DataSourceCollectionError(
      'This data source always fails',
      this.type,
      config.name,
      timeRange
    );
  }

  validate(config: DataSourceConfig): ValidationResult {
    return { isValid: true, errors: [] };
  }

  async testConnection(config: DataSourceConfig): Promise<boolean> {
    return false;
  }

  getConfigSchema() {
    return {
      $schema: 'http://json-schema.org/draft-07/schema#',
      type: 'object' as const,
      required: ['type', 'enabled', 'name'],
      properties: {
        type: { type: 'string', const: 'failing-mock' },
        enabled: { type: 'boolean' },
        name: { type: 'string' },
      },
      additionalProperties: false,
    };
  }
}

describe('Data Collection Integration Tests', () => {
  let manager: DataSourceManager;
  let fastMockSource: FastMockDataSource;
  let slowMockSource: SlowMockDataSource;
  let unreliableMockSource: UnreliableMockDataSource;
  let failingMockSource: FailingMockDataSource;
  let timeRange: TimeRange;

  beforeEach(() => {
    manager = new DataSourceManager();
    fastMockSource = new FastMockDataSource();
    slowMockSource = new SlowMockDataSource();
    unreliableMockSource = new UnreliableMockDataSource();
    failingMockSource = new FailingMockDataSource();
    
    timeRange = {
      start: new Date('2024-01-01'),
      end: new Date('2024-01-02'),
      type: 'daily',
    };

    // Register all data sources
    manager.registerDataSource(fastMockSource);
    manager.registerDataSource(slowMockSource);
    manager.registerDataSource(unreliableMockSource);
    manager.registerDataSource(failingMockSource);
  });

  afterEach(() => {
    vi.clearAllMocks();
    unreliableMockSource.resetAttempts();
  });

  describe('Concurrent Data Collection', () => {
    it('should collect data from multiple sources concurrently', async () => {
      const configs: DataSourceConfig[] = [
        { type: 'fast-mock', enabled: true, name: 'fast-config' },
        { type: 'slow-mock', enabled: true, name: 'slow-config' },
      ];

      const startTime = Date.now();
      const result = await manager.collectData(configs, timeRange, {
        concurrent: true,
        maxConcurrency: 2,
      });
      const endTime = Date.now();
      const duration = endTime - startTime;

      // Should complete in roughly the time of the slowest source (500ms)
      // rather than the sum of both (550ms)
      expect(duration).toBeLessThan(600);
      expect(result.data).toHaveLength(2);
      expect(result.summary.successfulSources).toBe(2);
      expect(result.summary.failedSources).toBe(0);
    });

    it('should respect concurrency limits', async () => {
      const configs: DataSourceConfig[] = [
        { type: 'slow-mock', enabled: true, name: 'slow-config-1' },
        { type: 'slow-mock', enabled: true, name: 'slow-config-2' },
        { type: 'slow-mock', enabled: true, name: 'slow-config-3' },
      ];

      // Create multiple slow sources
      const slowSource2 = new SlowMockDataSource();
      const slowSource3 = new SlowMockDataSource();
      (slowSource2 as any).type = 'slow-mock-2';
      (slowSource3 as any).type = 'slow-mock-3';
      
      manager.registerDataSource(slowSource2);
      manager.registerDataSource(slowSource3);

      const updatedConfigs = [
        { type: 'slow-mock', enabled: true, name: 'slow-config-1' },
        { type: 'slow-mock-2', enabled: true, name: 'slow-config-2' },
        { type: 'slow-mock-3', enabled: true, name: 'slow-config-3' },
      ];

      const startTime = Date.now();
      const result = await manager.collectData(updatedConfigs, timeRange, {
        concurrent: true,
        maxConcurrency: 2, // Limit to 2 concurrent operations
      });
      const endTime = Date.now();
      const duration = endTime - startTime;

      // With concurrency limit of 2, should take roughly 1000ms (2 batches of 500ms each)
      expect(duration).toBeGreaterThan(900);
      expect(duration).toBeLessThan(1200);
      expect(result.data).toHaveLength(3);
    });

    it('should collect data sequentially when concurrent is false', async () => {
      const configs: DataSourceConfig[] = [
        { type: 'fast-mock', enabled: true, name: 'fast-config' },
        { type: 'slow-mock', enabled: true, name: 'slow-config' },
      ];

      const startTime = Date.now();
      const result = await manager.collectData(configs, timeRange, {
        concurrent: false,
      });
      const endTime = Date.now();
      const duration = endTime - startTime;

      // Should take roughly the sum of both sources (550ms)
      expect(duration).toBeGreaterThan(500);
      expect(result.data).toHaveLength(2);
      expect(result.summary.successfulSources).toBe(2);
    });
  });

  describe('Error Handling and Graceful Degradation', () => {
    it('should continue collecting from other sources when one fails', async () => {
      const configs: DataSourceConfig[] = [
        { type: 'fast-mock', enabled: true, name: 'working-config' },
        { type: 'failing-mock', enabled: true, name: 'failing-config' },
        { type: 'slow-mock', enabled: true, name: 'another-working-config' },
      ];

      const result = await manager.collectData(configs, timeRange, {
        continueOnError: true,
      });

      expect(result.data).toHaveLength(2); // Two successful sources
      expect(result.errors).toHaveLength(1); // One failed source
      expect(result.errors[0]).toBeInstanceOf(DataSourceCollectionError);
      expect(result.summary.successfulSources).toBe(2);
      expect(result.summary.failedSources).toBe(1);
    });

    it('should stop on first error when continueOnError is false', async () => {
      const configs: DataSourceConfig[] = [
        { type: 'failing-mock', enabled: true, name: 'failing-config' },
        { type: 'fast-mock', enabled: true, name: 'working-config' },
      ];

      await expect(
        manager.collectData(configs, timeRange, {
          continueOnError: false,
        })
      ).rejects.toThrow(DataSourceCollectionError);
    });

    it('should handle retry logic for unreliable sources', async () => {
      const configs: DataSourceConfig[] = [
        {
          type: 'unreliable-mock',
          enabled: true,
          name: 'unreliable-config',
          maxRetries: 3,
        },
      ];

      const result = await manager.collectData(configs, timeRange);

      expect(result.data).toHaveLength(1);
      expect(result.summary.successfulSources).toBe(1);
      expect(result.summary.failedSources).toBe(0);
    });

    it('should fail after exhausting retries', async () => {
      const configs: DataSourceConfig[] = [
        {
          type: 'unreliable-mock',
          enabled: true,
          name: 'unreliable-config',
          maxRetries: 2, // Not enough retries
        },
      ];

      const result = await manager.collectData(configs, timeRange, {
        continueOnError: true,
      });

      expect(result.data).toHaveLength(0);
      expect(result.errors).toHaveLength(1);
      expect(result.summary.successfulSources).toBe(0);
      expect(result.summary.failedSources).toBe(1);
    });

    it('should handle timeout scenarios', async () => {
      const configs: DataSourceConfig[] = [
        {
          type: 'slow-mock',
          enabled: true,
          name: 'slow-config',
          timeout: 100, // Very short timeout
        },
      ];

      const result = await manager.collectData(configs, timeRange, {
        continueOnError: true,
      });

      expect(result.data).toHaveLength(0);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0].message).toContain('Operation timed out');
    });
  });

  describe('Progress Tracking', () => {
    it('should provide accurate progress updates', async () => {
      const progressUpdates: any[] = [];
      const configs: DataSourceConfig[] = [
        { type: 'fast-mock', enabled: true, name: 'fast-config' },
        { type: 'slow-mock', enabled: true, name: 'slow-config' },
        { type: 'failing-mock', enabled: true, name: 'failing-config' },
      ];

      await manager.collectData(configs, timeRange, {
        continueOnError: true,
        onProgress: (progress) => {
          progressUpdates.push({ ...progress });
        },
      });

      expect(progressUpdates.length).toBeGreaterThan(0);
      
      // Check initial progress
      const firstUpdate = progressUpdates[0];
      expect(firstUpdate.total).toBe(3);
      expect(firstUpdate.completed).toBe(0);
      expect(firstUpdate.failed).toBe(0);
      expect(firstUpdate.percentage).toBe(0);

      // Check final progress
      const lastUpdate = progressUpdates[progressUpdates.length - 1];
      expect(lastUpdate.percentage).toBe(100);
      expect(lastUpdate.completed + lastUpdate.failed).toBe(3);
    });

    it('should track current data source being processed', async () => {
      const progressUpdates: any[] = [];
      const configs: DataSourceConfig[] = [
        { type: 'fast-mock', enabled: true, name: 'test-config' },
      ];

      await manager.collectData(configs, timeRange, {
        onProgress: (progress) => {
          progressUpdates.push({ ...progress });
        },
      });

      const updatesWithCurrent = progressUpdates.filter(update => update.current);
      expect(updatesWithCurrent.length).toBeGreaterThan(0);
      expect(updatesWithCurrent[0].current).toBe('fast-mock:test-config');
    });
  });

  describe('Data Aggregation', () => {
    it('should aggregate data from multiple sources correctly', async () => {
      const configs: DataSourceConfig[] = [
        { type: 'fast-mock', enabled: true, name: 'fast-config' },
        { type: 'slow-mock', enabled: true, name: 'slow-config' },
      ];

      const result = await manager.collectData(configs, timeRange);

      expect(result.data).toHaveLength(2);
      expect(result.summary.totalDataPoints).toBe(2); // One commit from each source
      expect(result.summary.totalSources).toBe(2);
      expect(result.summary.successfulSources).toBe(2);
      
      // Check that data from both sources is present
      const sources = result.data.map(d => d.source);
      expect(sources).toContain('fast-mock:fast-config');
      expect(sources).toContain('slow-mock:slow-config');
    });

    it('should provide comprehensive collection metadata', async () => {
      const configs: DataSourceConfig[] = [
        { type: 'fast-mock', enabled: true, name: 'test-config' },
      ];

      const result = await manager.collectData(configs, timeRange, {
        concurrent: true,
        maxConcurrency: 2,
      });

      expect(result.metadata.collectedAt).toBeInstanceOf(Date);
      expect(result.metadata.options.concurrent).toBe(true);
      expect(result.metadata.options.maxConcurrency).toBe(2);
      expect(result.metadata.sources).toEqual(['fast-mock:test-config']);
      
      expect(result.summary.collectionTime).toBeGreaterThan(0);
      expect(result.summary.timeRange).toBe(timeRange);
    });
  });

  describe('Configuration Validation Integration', () => {
    it('should validate all configurations before collection', async () => {
      const configs: DataSourceConfig[] = [
        { type: 'fast-mock', enabled: true, name: 'valid-config' },
        { type: 'non-existent', enabled: true, name: 'invalid-config' },
      ];

      const result = await manager.collectData(configs, timeRange, {
        continueOnError: true,
      });

      expect(result.data).toHaveLength(1); // Only valid config processed
      expect(result.errors).toHaveLength(1); // Validation error for invalid config
      expect(result.errors[0].message).toContain('not registered');
    });

    it('should skip disabled data sources', async () => {
      const configs: DataSourceConfig[] = [
        { type: 'fast-mock', enabled: true, name: 'enabled-config' },
        { type: 'slow-mock', enabled: false, name: 'disabled-config' },
      ];

      const result = await manager.collectData(configs, timeRange);

      expect(result.data).toHaveLength(1);
      expect(result.data[0].source).toBe('fast-mock:enabled-config');
      expect(result.summary.totalSources).toBe(2); // Total includes disabled
      expect(result.summary.successfulSources).toBe(1); // Only enabled processed
    });
  });

  describe('Performance and Scalability', () => {
    it('should handle large numbers of data sources efficiently', async () => {
      // Create multiple fast data sources
      const configs: DataSourceConfig[] = [];
      const numSources = 10;

      for (let i = 0; i < numSources; i++) {
        const fastSource = new FastMockDataSource();
        (fastSource as any).type = `fast-mock-${i}`;
        manager.registerDataSource(fastSource);
        
        configs.push({
          type: `fast-mock-${i}`,
          enabled: true,
          name: `config-${i}`,
        });
      }

      const startTime = Date.now();
      const result = await manager.collectData(configs, timeRange, {
        concurrent: true,
        maxConcurrency: 5,
      });
      const endTime = Date.now();
      const duration = endTime - startTime;

      expect(result.data).toHaveLength(numSources);
      expect(result.summary.successfulSources).toBe(numSources);
      
      // Should complete efficiently with concurrency
      expect(duration).toBeLessThan(200); // Much faster than sequential
    });

    it('should handle mixed performance characteristics', async () => {
      const configs: DataSourceConfig[] = [
        { type: 'fast-mock', enabled: true, name: 'fast-1' },
        { type: 'fast-mock', enabled: true, name: 'fast-2' },
        { type: 'slow-mock', enabled: true, name: 'slow-1' },
      ];

      // Register additional fast source
      const fastSource2 = new FastMockDataSource();
      (fastSource2 as any).type = 'fast-mock-2';
      manager.registerDataSource(fastSource2);

      const updatedConfigs = [
        { type: 'fast-mock', enabled: true, name: 'fast-1' },
        { type: 'fast-mock-2', enabled: true, name: 'fast-2' },
        { type: 'slow-mock', enabled: true, name: 'slow-1' },
      ];

      const result = await manager.collectData(updatedConfigs, timeRange, {
        concurrent: true,
        maxConcurrency: 3,
      });

      expect(result.data).toHaveLength(3);
      expect(result.summary.successfulSources).toBe(3);
      
      // Verify data from all sources
      const sources = result.data.map(d => d.source);
      expect(sources).toContain('fast-mock:fast-1');
      expect(sources).toContain('fast-mock-2:fast-2');
      expect(sources).toContain('slow-mock:slow-1');
    });
  });
});