// Data source interfaces and types for pluggable architecture

import { TimeRange, ValidationResult, CollectedData } from './config';

/**
 * Base interface for all data sources
 */
export interface DataSource {
  /** Unique identifier for the data source type */
  readonly type: string;
  
  /** Human-readable name for the data source */
  readonly name: string;
  
  /** Version of the data source implementation */
  readonly version: string;
  
  /**
   * Collect data from this source for the specified time range
   * @param config Configuration specific to this data source
   * @param timeRange Time range for data collection
   * @returns Promise resolving to collected data
   */
  collect(config: DataSourceConfig, timeRange: TimeRange): Promise<CollectedData>;
  
  /**
   * Validate the configuration for this data source
   * @param config Configuration to validate
   * @returns Validation result with errors if any
   */
  validate(config: DataSourceConfig): ValidationResult;
  
  /**
   * Test connection/availability of this data source
   * @param config Configuration to test
   * @returns Promise resolving to true if connection is successful
   */
  testConnection(config: DataSourceConfig): Promise<boolean>;
  
  /**
   * Get supported configuration schema for this data source
   * @returns JSON schema describing the configuration structure
   */
  getConfigSchema(): DataSourceConfigSchema;
}

/**
 * Base configuration interface for data sources
 */
export interface DataSourceConfig {
  /** Type identifier matching the DataSource.type */
  type: string;
  
  /** Whether this data source is enabled */
  enabled: boolean;
  
  /** Human-readable name for this configuration */
  name: string;
  
  /** Optional description */
  description?: string;
  
  /** Priority for data collection (higher numbers = higher priority) */
  priority?: number;
  
  /** Timeout in milliseconds for data collection operations */
  timeout?: number;
  
  /** Maximum number of retries for failed operations */
  maxRetries?: number;
}

/**
 * Schema definition for data source configuration
 */
export interface DataSourceConfigSchema {
  /** JSON Schema version */
  $schema: string;
  
  /** Schema type */
  type: 'object';
  
  /** Required properties */
  required: string[];
  
  /** Property definitions */
  properties: Record<string, any>;
  
  /** Additional properties allowed */
  additionalProperties?: boolean;
}

/**
 * Error types for data source operations
 */
export class DataSourceError extends Error {
  constructor(
    message: string,
    public readonly sourceType: string,
    public readonly sourceName: string,
    public readonly code?: string,
    public readonly cause?: Error
  ) {
    super(message);
    this.name = 'DataSourceError';
  }
}

/**
 * Configuration validation error
 */
export class DataSourceConfigError extends DataSourceError {
  constructor(
    message: string,
    sourceType: string,
    sourceName: string,
    public readonly validationErrors: string[]
  ) {
    super(message, sourceType, sourceName, 'CONFIG_VALIDATION_ERROR');
    this.name = 'DataSourceConfigError';
  }
}

/**
 * Connection error for data sources
 */
export class DataSourceConnectionError extends DataSourceError {
  constructor(
    message: string,
    sourceType: string,
    sourceName: string,
    cause?: Error
  ) {
    super(message, sourceType, sourceName, 'CONNECTION_ERROR', cause);
    this.name = 'DataSourceConnectionError';
  }
}

/**
 * Data collection error
 */
export class DataSourceCollectionError extends DataSourceError {
  constructor(
    message: string,
    sourceType: string,
    sourceName: string,
    public readonly timeRange: TimeRange,
    cause?: Error
  ) {
    super(message, sourceType, sourceName, 'COLLECTION_ERROR', cause);
    this.name = 'DataSourceCollectionError';
  }
}

/**
 * Registry entry for data sources
 */
export interface DataSourceRegistryEntry {
  /** The data source instance */
  dataSource: DataSource;
  
  /** When this data source was registered */
  registeredAt: Date;
  
  /** Whether this data source is currently active */
  active: boolean;
  
  /** Optional metadata about the data source */
  metadata?: Record<string, any>;
}

/**
 * Options for data collection operations
 */
export interface DataCollectionOptions {
  /** Whether to collect data concurrently from multiple sources */
  concurrent?: boolean;
  
  /** Maximum number of concurrent operations */
  maxConcurrency?: number;
  
  /** Whether to continue on errors (graceful degradation) */
  continueOnError?: boolean;
  
  /** Timeout for the entire collection operation */
  globalTimeout?: number;
  
  /** Progress callback for tracking collection progress */
  onProgress?: (progress: DataCollectionProgress) => void;
}

/**
 * Progress information for data collection
 */
export interface DataCollectionProgress {
  /** Total number of data sources */
  total: number;
  
  /** Number of completed data sources */
  completed: number;
  
  /** Number of failed data sources */
  failed: number;
  
  /** Currently processing data source */
  current?: string;
  
  /** Overall progress percentage (0-100) */
  percentage: number;
  
  /** Any errors encountered */
  errors: DataSourceError[];
}

/**
 * Result of data collection operation
 */
export interface DataCollectionResult {
  /** Successfully collected data */
  data: CollectedData[];
  
  /** Errors encountered during collection */
  errors: DataSourceError[];
  
  /** Summary of the collection operation */
  summary: {
    totalSources: number;
    successfulSources: number;
    failedSources: number;
    totalDataPoints: number;
    collectionTime: number; // milliseconds
    timeRange: TimeRange;
  };
  
  /** Metadata about the collection operation */
  metadata: {
    collectedAt: Date;
    options: DataCollectionOptions;
    sources: string[];
  };
}