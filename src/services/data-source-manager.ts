// Data source management system with pluggable architecture

import {
  DataSource,
  DataSourceConfig,
  DataSourceRegistryEntry,
  DataCollectionOptions,
  DataCollectionResult,
  DataCollectionProgress,
  DataSourceError,
  DataSourceConfigError,
  DataSourceConnectionError,
  DataSourceCollectionError,
} from '../models/data-source';
import { TimeRange, CollectedData } from '../models/config';

/**
 * Manager for registering and orchestrating data sources
 */
export class DataSourceManager {
  private registry = new Map<string, DataSourceRegistryEntry>();
  private defaultOptions: DataCollectionOptions = {
    concurrent: true,
    maxConcurrency: 3,
    continueOnError: true,
    globalTimeout: 300000, // 5 minutes
  };

  /**
   * Register a data source with the manager
   */
  registerDataSource(dataSource: DataSource, metadata?: Record<string, any>): void {
    if (this.registry.has(dataSource.type)) {
      throw new Error(`Data source type '${dataSource.type}' is already registered`);
    }

    const entry: DataSourceRegistryEntry = {
      dataSource,
      registeredAt: new Date(),
      active: true,
      metadata,
    };

    this.registry.set(dataSource.type, entry);
  }

  /**
   * Unregister a data source
   */
  unregisterDataSource(type: string): boolean {
    return this.registry.delete(type);
  }

  /**
   * Get a registered data source by type
   */
  getDataSource(type: string): DataSource | undefined {
    const entry = this.registry.get(type);
    return entry?.active ? entry.dataSource : undefined;
  }

  /**
   * Get all registered data sources
   */
  getAllDataSources(): DataSource[] {
    return Array.from(this.registry.values())
      .filter(entry => entry.active)
      .map(entry => entry.dataSource);
  }

  /**
   * Get registry information for all data sources
   */
  getRegistryInfo(): Map<string, DataSourceRegistryEntry> {
    return new Map(this.registry);
  }

  /**
   * Check if a data source type is registered
   */
  isRegistered(type: string): boolean {
    const entry = this.registry.get(type);
    return entry !== undefined && entry.active;
  }

  /**
   * Activate or deactivate a data source
   */
  setDataSourceActive(type: string, active: boolean): boolean {
    const entry = this.registry.get(type);
    if (entry) {
      entry.active = active;
      return true;
    }
    return false;
  }

  /**
   * Validate configurations for multiple data sources
   */
  validateConfigurations(configs: DataSourceConfig[]): ValidationResult[] {
    return configs.map(config => {
      const dataSource = this.getDataSource(config.type);
      
      if (!dataSource) {
        return {
          isValid: false,
          errors: [`Data source type '${config.type}' is not registered`],
          config,
        };
      }

      const validation = dataSource.validate(config);
      return {
        ...validation,
        config,
      };
    });
  }

  /**
   * Test connections for multiple data sources
   */
  async testConnections(configs: DataSourceConfig[]): Promise<ConnectionTestResult[]> {
    const results: ConnectionTestResult[] = [];

    for (const config of configs) {
      if (!config.enabled) {
        results.push({
          config,
          success: false,
          skipped: true,
          message: 'Data source is disabled',
        });
        continue;
      }

      const dataSource = this.getDataSource(config.type);
      
      if (!dataSource) {
        results.push({
          config,
          success: false,
          error: new DataSourceError(
            `Data source type '${config.type}' is not registered`,
            config.type,
            config.name
          ),
        });
        continue;
      }

      try {
        const success = await dataSource.testConnection(config);
        results.push({
          config,
          success,
          message: success ? 'Connection successful' : 'Connection failed',
        });
      } catch (error) {
        results.push({
          config,
          success: false,
          error: new DataSourceConnectionError(
            `Connection test failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
            config.type,
            config.name,
            error instanceof Error ? error : undefined
          ),
        });
      }
    }

    return results;
  }

  /**
   * Collect data from multiple sources with orchestration
   */
  async collectData(
    configs: DataSourceConfig[],
    timeRange: TimeRange,
    options: Partial<DataCollectionOptions> = {}
  ): Promise<DataCollectionResult> {
    const mergedOptions: DataCollectionOptions = { ...this.defaultOptions, ...options };
    const startTime = Date.now();
    
    // Filter enabled configurations
    const enabledConfigs = configs.filter(config => config.enabled);
    
    // Validate configurations first
    const validationResults = this.validateConfigurations(enabledConfigs);
    const validConfigs = enabledConfigs.filter((config, index) => 
      validationResults[index].isValid
    );
    
    // Collect validation errors
    const validationErrors: DataSourceError[] = validationResults
      .filter(result => !result.isValid)
      .map(result => new DataSourceConfigError(
        `Configuration validation failed: ${result.errors.join(', ')}`,
        result.config.type,
        result.config.name,
        result.errors
      ));

    // Initialize progress tracking
    const progress: DataCollectionProgress = {
      total: validConfigs.length,
      completed: 0,
      failed: 0,
      percentage: 0,
      errors: [...validationErrors],
    };

    const updateProgress = () => {
      progress.percentage = progress.total > 0 
        ? Math.round(((progress.completed + progress.failed) / progress.total) * 100)
        : 100;
      
      if (mergedOptions.onProgress) {
        mergedOptions.onProgress({ ...progress });
      }
    };

    updateProgress();

    // Collect data
    const collectedData: CollectedData[] = [];
    const errors: DataSourceError[] = [...validationErrors];

    if (mergedOptions.concurrent) {
      await this.collectDataConcurrently(
        validConfigs,
        timeRange,
        mergedOptions,
        collectedData,
        errors,
        progress,
        updateProgress
      );
    } else {
      await this.collectDataSequentially(
        validConfigs,
        timeRange,
        mergedOptions,
        collectedData,
        errors,
        progress,
        updateProgress
      );
    }

    const endTime = Date.now();
    const collectionTime = endTime - startTime;

    // Calculate total data points
    const totalDataPoints = collectedData.reduce((sum, data) => {
      return sum + (Array.isArray(data.data) ? data.data.length : 1);
    }, 0);

    return {
      data: collectedData,
      errors,
      summary: {
        totalSources: configs.length,
        successfulSources: collectedData.length,
        failedSources: errors.filter(e => e instanceof DataSourceCollectionError).length,
        totalDataPoints,
        collectionTime,
        timeRange,
      },
      metadata: {
        collectedAt: new Date(),
        options: mergedOptions,
        sources: validConfigs.map(config => `${config.type}:${config.name}`),
      },
    };
  }

  /**
   * Collect data concurrently from multiple sources
   */
  private async collectDataConcurrently(
    configs: DataSourceConfig[],
    timeRange: TimeRange,
    options: DataCollectionOptions,
    collectedData: CollectedData[],
    errors: DataSourceError[],
    progress: DataCollectionProgress,
    updateProgress: () => void
  ): Promise<void> {
    const maxConcurrency = options.maxConcurrency || 3;
    const semaphore = new Semaphore(maxConcurrency);

    const promises = configs.map(async (config) => {
      return semaphore.acquire(async () => {
        progress.current = `${config.type}:${config.name}`;
        updateProgress();

        try {
          const data = await this.collectFromSingleSource(config, timeRange, options);
          collectedData.push(data);
          progress.completed++;
        } catch (error) {
          const dataSourceError = error instanceof DataSourceError 
            ? error 
            : new DataSourceCollectionError(
                `Data collection failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
                config.type,
                config.name,
                timeRange,
                error instanceof Error ? error : undefined
              );
          
          errors.push(dataSourceError);
          progress.failed++;
          progress.errors.push(dataSourceError);

          if (!options.continueOnError) {
            throw dataSourceError;
          }
        }

        updateProgress();
      });
    });

    if (options.continueOnError) {
      await Promise.allSettled(promises);
    } else {
      await Promise.all(promises);
    }
  }

  /**
   * Collect data sequentially from multiple sources
   */
  private async collectDataSequentially(
    configs: DataSourceConfig[],
    timeRange: TimeRange,
    options: DataCollectionOptions,
    collectedData: CollectedData[],
    errors: DataSourceError[],
    progress: DataCollectionProgress,
    updateProgress: () => void
  ): Promise<void> {
    for (const config of configs) {
      progress.current = `${config.type}:${config.name}`;
      updateProgress();

      try {
        const data = await this.collectFromSingleSource(config, timeRange, options);
        collectedData.push(data);
        progress.completed++;
      } catch (error) {
        const dataSourceError = error instanceof DataSourceError 
          ? error 
          : new DataSourceCollectionError(
              `Data collection failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
              config.type,
              config.name,
              timeRange,
              error instanceof Error ? error : undefined
            );
        
        errors.push(dataSourceError);
        progress.failed++;
        progress.errors.push(dataSourceError);

        if (!options.continueOnError) {
          throw dataSourceError;
        }
      }

      updateProgress();
    }
  }

  /**
   * Collect data from a single source with timeout and retry logic
   */
  private async collectFromSingleSource(
    config: DataSourceConfig,
    timeRange: TimeRange,
    options: DataCollectionOptions
  ): Promise<CollectedData> {
    const dataSource = this.getDataSource(config.type);
    
    if (!dataSource) {
      throw new DataSourceError(
        `Data source type '${config.type}' is not registered`,
        config.type,
        config.name
      );
    }

    const timeout = config.timeout || options.globalTimeout || 60000;
    const maxRetries = config.maxRetries || 3;
    
    let lastError: Error | undefined;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        const collectPromise = dataSource.collect(config, timeRange);
        const timeoutPromise = new Promise<never>((_, reject) => {
          setTimeout(() => reject(new Error('Operation timed out')), timeout);
        });

        const data = await Promise.race([collectPromise, timeoutPromise]);
        return data;
      } catch (error) {
        lastError = error instanceof Error ? error : new Error('Unknown error');
        
        if (attempt < maxRetries) {
          // Exponential backoff
          const delay = Math.min(1000 * Math.pow(2, attempt - 1), 10000);
          await new Promise(resolve => setTimeout(resolve, delay));
        }
      }
    }

    throw new DataSourceCollectionError(
      `Failed to collect data after ${maxRetries} attempts: ${lastError?.message || 'Unknown error'}`,
      config.type,
      config.name,
      timeRange,
      lastError
    );
  }

  /**
   * Set default options for data collection
   */
  setDefaultOptions(options: Partial<DataCollectionOptions>): void {
    this.defaultOptions = { ...this.defaultOptions, ...options };
  }

  /**
   * Get current default options
   */
  getDefaultOptions(): DataCollectionOptions {
    return { ...this.defaultOptions };
  }

  /**
   * Clear all registered data sources
   */
  clear(): void {
    this.registry.clear();
  }

  /**
   * Get statistics about registered data sources
   */
  getStatistics(): DataSourceManagerStatistics {
    const entries = Array.from(this.registry.values());
    
    return {
      totalRegistered: entries.length,
      activeCount: entries.filter(entry => entry.active).length,
      inactiveCount: entries.filter(entry => !entry.active).length,
      typeBreakdown: entries.reduce((acc, entry) => {
        acc[entry.dataSource.type] = (acc[entry.dataSource.type] || 0) + 1;
        return acc;
      }, {} as Record<string, number>),
      oldestRegistration: entries.length > 0 
        ? new Date(Math.min(...entries.map(e => e.registeredAt.getTime())))
        : undefined,
      newestRegistration: entries.length > 0
        ? new Date(Math.max(...entries.map(e => e.registeredAt.getTime())))
        : undefined,
    };
  }
}

/**
 * Simple semaphore implementation for controlling concurrency
 */
class Semaphore {
  private permits: number;
  private waitQueue: Array<() => void> = [];

  constructor(permits: number) {
    this.permits = permits;
  }

  async acquire<T>(task: () => Promise<T>): Promise<T> {
    await this.waitForPermit();
    try {
      return await task();
    } finally {
      this.release();
    }
  }

  private async waitForPermit(): Promise<void> {
    if (this.permits > 0) {
      this.permits--;
      return;
    }

    return new Promise<void>(resolve => {
      this.waitQueue.push(resolve);
    });
  }

  private release(): void {
    if (this.waitQueue.length > 0) {
      const next = this.waitQueue.shift()!;
      next();
    } else {
      this.permits++;
    }
  }
}

// Additional interfaces for the manager

interface ValidationResult {
  isValid: boolean;
  errors: string[];
  config: DataSourceConfig;
}

interface ConnectionTestResult {
  config: DataSourceConfig;
  success: boolean;
  skipped?: boolean;
  message?: string;
  error?: DataSourceError;
}

interface DataSourceManagerStatistics {
  totalRegistered: number;
  activeCount: number;
  inactiveCount: number;
  typeBreakdown: Record<string, number>;
  oldestRegistration?: Date;
  newestRegistration?: Date;
}