// Unit tests for DataSourceManager

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
import { TimeRange, CollectedData, ValidationResult } from '../../models/config';

// Mock data source for testing
class MockDataSource implements DataSource {
  readonly type = 'mock';
  readonly name = 'Mock Data Source';
  readonly version = '1.0.0';

  constructor(
    private shouldFailValidation = false,
    private shouldFailConnection = false,
    private shouldFailCollection = false,
    private collectionDelay = 0
  ) {}

  async collect(config: DataSourceConfig, timeRange: TimeRange): Promise<CollectedData> {
    if (this.shouldFailCollection) {
      throw new Error('Mock collection failure');
    }

    if (this.collectionDelay > 0) {
      await new Promise(resolve => setTimeout(resolve, this.collectionDelay));
    }

    return {
      source: `${this.type}:${config.name}`,
      timeRange,
      data: [
        {
          hash: 'mock-hash-1',
          author: 'Mock Author',
          date: new Date(),
          message: 'Mock commit message',
          filesChanged: ['file1.ts'],
          additions: 10,
          deletions: 5,
        },
      ],
    };
  }

  validate(config: DataSourceConfig): ValidationResult {
    if (this.shouldFailValidation) {
      return {
        isValid: false,
        errors: ['Mock validation error'],
      };
    }

    return {
      isValid: true,
      errors: [],
    };
  }

  async testConnection(config: DataSourceConfig): Promise<boolean> {
    if (this.shouldFailConnection) {
      throw new Error('Mock connection failure');
    }
    return true;
  }

  getConfigSchema() {
    return {
      $schema: 'http://json-schema.org/draft-07/schema#',
      type: 'object' as const,
      required: ['type', 'enabled', 'name'],
      properties: {
        type: { type: 'string', const: 'mock' },
        enabled: { type: 'boolean' },
        name: { type: 'string' },
      },
      additionalProperties: false,
    };
  }
}

describe('DataSourceManager', () => {
  let manager: DataSourceManager;
  let mockDataSource: MockDataSource;
  let gitDataSource: GitDataSource;

  beforeEach(() => {
    manager = new DataSourceManager();
    mockDataSource = new MockDataSource();
    gitDataSource = new GitDataSource();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('Data Source Registration', () => {
    it('should register a data source successfully', () => {
      manager.registerDataSource(mockDataSource);
      
      expect(manager.isRegistered('mock')).toBe(true);
      expect(manager.getDataSource('mock')).toBe(mockDataSource);
    });

    it('should register multiple different data sources', () => {
      manager.registerDataSource(mockDataSource);
      manager.registerDataSource(gitDataSource);
      
      expect(manager.isRegistered('mock')).toBe(true);
      expect(manager.isRegistered('git')).toBe(true);
      expect(manager.getAllDataSources()).toHaveLength(2);
    });

    it('should throw error when registering duplicate data source type', () => {
      manager.registerDataSource(mockDataSource);
      
      expect(() => {
        manager.registerDataSource(new MockDataSource());
      }).toThrow("Data source type 'mock' is already registered");
    });

    it('should register data source with metadata', () => {
      const metadata = { version: '1.0.0', author: 'test' };
      manager.registerDataSource(mockDataSource, metadata);
      
      const registryInfo = manager.getRegistryInfo();
      const entry = registryInfo.get('mock');
      
      expect(entry).toBeDefined();
      expect(entry!.metadata).toEqual(metadata);
      expect(entry!.registeredAt).toBeInstanceOf(Date);
    });

    it('should unregister a data source', () => {
      manager.registerDataSource(mockDataSource);
      expect(manager.isRegistered('mock')).toBe(true);
      
      const result = manager.unregisterDataSource('mock');
      expect(result).toBe(true);
      expect(manager.isRegistered('mock')).toBe(false);
    });

    it('should return false when unregistering non-existent data source', () => {
      const result = manager.unregisterDataSource('non-existent');
      expect(result).toBe(false);
    });

    it('should activate and deactivate data sources', () => {
      manager.registerDataSource(mockDataSource);
      expect(manager.getDataSource('mock')).toBe(mockDataSource);
      
      manager.setDataSourceActive('mock', false);
      expect(manager.getDataSource('mock')).toBeUndefined();
      expect(manager.getAllDataSources()).toHaveLength(0);
      
      manager.setDataSourceActive('mock', true);
      expect(manager.getDataSource('mock')).toBe(mockDataSource);
    });
  });

  describe('Configuration Validation', () => {
    beforeEach(() => {
      manager.registerDataSource(mockDataSource);
    });

    it('should validate configurations successfully', () => {
      const configs: DataSourceConfig[] = [
        {
          type: 'mock',
          enabled: true,
          name: 'test-config',
        },
      ];

      const results = manager.validateConfigurations(configs);
      
      expect(results).toHaveLength(1);
      expect(results[0].isValid).toBe(true);
      expect(results[0].errors).toHaveLength(0);
    });

    it('should return validation errors for invalid configurations', () => {
      const failingMockSource = new MockDataSource(true);
      manager.unregisterDataSource('mock');
      manager.registerDataSource(failingMockSource);

      const configs: DataSourceConfig[] = [
        {
          type: 'mock',
          enabled: true,
          name: 'test-config',
        },
      ];

      const results = manager.validateConfigurations(configs);
      
      expect(results).toHaveLength(1);
      expect(results[0].isValid).toBe(false);
      expect(results[0].errors).toContain('Mock validation error');
    });

    it('should handle unregistered data source types', () => {
      const configs: DataSourceConfig[] = [
        {
          type: 'unregistered',
          enabled: true,
          name: 'test-config',
        },
      ];

      const results = manager.validateConfigurations(configs);
      
      expect(results).toHaveLength(1);
      expect(results[0].isValid).toBe(false);
      expect(results[0].errors).toContain("Data source type 'unregistered' is not registered");
    });
  });

  describe('Connection Testing', () => {
    beforeEach(() => {
      manager.registerDataSource(mockDataSource);
    });

    it('should test connections successfully', async () => {
      const configs: DataSourceConfig[] = [
        {
          type: 'mock',
          enabled: true,
          name: 'test-config',
        },
      ];

      const results = await manager.testConnections(configs);
      
      expect(results).toHaveLength(1);
      expect(results[0].success).toBe(true);
      expect(results[0].message).toBe('Connection successful');
    });

    it('should handle connection failures', async () => {
      const failingMockSource = new MockDataSource(false, true);
      manager.unregisterDataSource('mock');
      manager.registerDataSource(failingMockSource);

      const configs: DataSourceConfig[] = [
        {
          type: 'mock',
          enabled: true,
          name: 'test-config',
        },
      ];

      const results = await manager.testConnections(configs);
      
      expect(results).toHaveLength(1);
      expect(results[0].success).toBe(false);
      expect(results[0].error).toBeInstanceOf(DataSourceConnectionError);
    });

    it('should skip disabled data sources', async () => {
      const configs: DataSourceConfig[] = [
        {
          type: 'mock',
          enabled: false,
          name: 'test-config',
        },
      ];

      const results = await manager.testConnections(configs);
      
      expect(results).toHaveLength(1);
      expect(results[0].success).toBe(false);
      expect(results[0].skipped).toBe(true);
      expect(results[0].message).toBe('Data source is disabled');
    });
  });

  describe('Data Collection', () => {
    let timeRange: TimeRange;

    beforeEach(() => {
      timeRange = {
        start: new Date('2024-01-01'),
        end: new Date('2024-01-02'),
        type: 'daily',
      };
      manager.registerDataSource(mockDataSource);
    });

    it('should collect data from single source', async () => {
      const configs: DataSourceConfig[] = [
        {
          type: 'mock',
          enabled: true,
          name: 'test-config',
        },
      ];

      const result = await manager.collectData(configs, timeRange);
      
      expect(result.data).toHaveLength(1);
      expect(result.data[0].source).toBe('mock:test-config');
      expect(result.errors).toHaveLength(0);
      expect(result.summary.successfulSources).toBe(1);
      expect(result.summary.failedSources).toBe(0);
    });

    it('should collect data from multiple sources concurrently', async () => {
      // Create a second mock source with different type
      class Mock2DataSource extends MockDataSource {
        readonly type = 'mock2';
        readonly name = 'Mock2 Data Source';
      }
      const secondMockSource = new Mock2DataSource();
      manager.registerDataSource(secondMockSource);

      const configs: DataSourceConfig[] = [
        {
          type: 'mock',
          enabled: true,
          name: 'test-config-1',
        },
        {
          type: 'mock2',
          enabled: true,
          name: 'test-config-2',
        },
      ];

      const result = await manager.collectData(configs, timeRange, {
        concurrent: true,
        maxConcurrency: 2,
      });
      
      expect(result.data).toHaveLength(2);
      expect(result.summary.successfulSources).toBe(2);
      expect(result.summary.failedSources).toBe(0);
    });

    it('should handle collection failures with graceful degradation', async () => {
      // Create a failing mock source with different type
      class FailingMockDataSource extends MockDataSource {
        readonly type = 'failing-mock';
        readonly name = 'Failing Mock Data Source';
      }
      const failingMockSource = new FailingMockDataSource(false, false, true);
      manager.registerDataSource(failingMockSource);

      const configs: DataSourceConfig[] = [
        {
          type: 'mock',
          enabled: true,
          name: 'working-config',
        },
        {
          type: 'failing-mock',
          enabled: true,
          name: 'failing-config',
        },
      ];

      const result = await manager.collectData(configs, timeRange, {
        continueOnError: true,
      });
      
      expect(result.data).toHaveLength(1);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0]).toBeInstanceOf(DataSourceCollectionError);
      expect(result.summary.successfulSources).toBe(1);
      expect(result.summary.failedSources).toBe(1);
    });

    it('should skip disabled data sources', async () => {
      const configs: DataSourceConfig[] = [
        {
          type: 'mock',
          enabled: false,
          name: 'disabled-config',
        },
        {
          type: 'mock',
          enabled: true,
          name: 'enabled-config',
        },
      ];

      const result = await manager.collectData(configs, timeRange);
      
      expect(result.data).toHaveLength(1);
      expect(result.data[0].source).toBe('mock:enabled-config');
    });

    it('should handle validation errors during collection', async () => {
      const failingValidationSource = new MockDataSource(true);
      manager.unregisterDataSource('mock');
      manager.registerDataSource(failingValidationSource);

      const configs: DataSourceConfig[] = [
        {
          type: 'mock',
          enabled: true,
          name: 'invalid-config',
        },
      ];

      const result = await manager.collectData(configs, timeRange);
      
      expect(result.data).toHaveLength(0);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0].message).toContain('Configuration validation failed');
    });

    it('should respect timeout settings', async () => {
      const slowMockSource = new MockDataSource(false, false, false, 2000);
      manager.unregisterDataSource('mock');
      manager.registerDataSource(slowMockSource);

      const configs: DataSourceConfig[] = [
        {
          type: 'mock',
          enabled: true,
          name: 'slow-config',
          timeout: 100, // Very short timeout
        },
      ];

      const result = await manager.collectData(configs, timeRange);
      
      expect(result.data).toHaveLength(0);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0].message).toContain('Operation timed out');
    });

    it('should provide progress updates', async () => {
      const progressUpdates: any[] = [];
      
      const configs: DataSourceConfig[] = [
        {
          type: 'mock',
          enabled: true,
          name: 'test-config',
        },
      ];

      await manager.collectData(configs, timeRange, {
        onProgress: (progress) => {
          progressUpdates.push({ ...progress });
        },
      });
      
      expect(progressUpdates.length).toBeGreaterThan(0);
      expect(progressUpdates[progressUpdates.length - 1].percentage).toBe(100);
    });
  });

  describe('Statistics and Management', () => {
    it('should provide accurate statistics', () => {
      manager.registerDataSource(mockDataSource);
      manager.registerDataSource(gitDataSource);
      manager.setDataSourceActive('mock', false);

      const stats = manager.getStatistics();
      
      expect(stats.totalRegistered).toBe(2);
      expect(stats.activeCount).toBe(1);
      expect(stats.inactiveCount).toBe(1);
      expect(stats.typeBreakdown).toEqual({
        mock: 1,
        git: 1,
      });
      expect(stats.oldestRegistration).toBeInstanceOf(Date);
      expect(stats.newestRegistration).toBeInstanceOf(Date);
    });

    it('should handle empty registry statistics', () => {
      const stats = manager.getStatistics();
      
      expect(stats.totalRegistered).toBe(0);
      expect(stats.activeCount).toBe(0);
      expect(stats.inactiveCount).toBe(0);
      expect(stats.typeBreakdown).toEqual({});
      expect(stats.oldestRegistration).toBeUndefined();
      expect(stats.newestRegistration).toBeUndefined();
    });

    it('should clear all registered data sources', () => {
      manager.registerDataSource(mockDataSource);
      manager.registerDataSource(gitDataSource);
      
      expect(manager.getAllDataSources()).toHaveLength(2);
      
      manager.clear();
      
      expect(manager.getAllDataSources()).toHaveLength(0);
      expect(manager.getStatistics().totalRegistered).toBe(0);
    });

    it('should manage default options', () => {
      const newDefaults = {
        concurrent: false,
        maxConcurrency: 5,
        continueOnError: false,
      };

      manager.setDefaultOptions(newDefaults);
      const currentDefaults = manager.getDefaultOptions();
      
      expect(currentDefaults.concurrent).toBe(false);
      expect(currentDefaults.maxConcurrency).toBe(5);
      expect(currentDefaults.continueOnError).toBe(false);
      expect(currentDefaults.globalTimeout).toBe(300000); // Should preserve existing values
    });
  });

  describe('Error Handling', () => {
    it('should create appropriate error types', () => {
      const dataSourceError = new DataSourceError('Test error', 'test-type', 'test-name');
      expect(dataSourceError).toBeInstanceOf(Error);
      expect(dataSourceError.name).toBe('DataSourceError');
      expect(dataSourceError.sourceType).toBe('test-type');
      expect(dataSourceError.sourceName).toBe('test-name');
    });

    it('should handle retry logic for failed collections', async () => {
      const testTimeRange: TimeRange = {
        start: new Date('2024-01-01'),
        end: new Date('2024-01-02'),
        type: 'daily',
      };
      
      let attemptCount = 0;
      const flakyMockSource = new MockDataSource();
      
      // Override collect method to fail first two attempts
      const originalCollect = flakyMockSource.collect.bind(flakyMockSource);
      flakyMockSource.collect = async (config, timeRange) => {
        attemptCount++;
        if (attemptCount <= 2) {
          throw new Error('Temporary failure');
        }
        return originalCollect(config, timeRange);
      };

      manager.registerDataSource(flakyMockSource);

      const configs: DataSourceConfig[] = [
        {
          type: 'mock',
          enabled: true,
          name: 'flaky-config',
          maxRetries: 3,
        },
      ];

      const result = await manager.collectData(configs, testTimeRange);
      
      expect(result.data).toHaveLength(1);
      expect(attemptCount).toBe(3);
    });
  });
});