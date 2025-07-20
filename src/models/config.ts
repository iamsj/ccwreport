// Core configuration interfaces and types

export type ReportType = 'daily' | 'weekly' | 'monthly';
export type OutputFormat = 'markdown' | 'html';
export type AIProvider = 'openai' | 'anthropic' | 'local';

export interface TimeRange {
  start: Date;
  end: Date;
  type: ReportType;
}

export interface ValidationResult {
  isValid: boolean;
  errors: string[];
  warnings?: string[];
}

// Git-specific configuration
export interface GitCredentials {
  username: string;
  token: string; // Personal access token or password
}

export interface GitRepository {
  name: string;
  path: string;
  remote?: string;
  branch?: string;
  credentials?: GitCredentials;
}

// Base data source configuration
export interface DataSourceConfig {
  type: string;
  enabled: boolean;
  name: string;
}

export interface GitDataSourceConfig extends DataSourceConfig {
  type: 'git';
  repositories: GitRepository[];
  username?: string;
  timeRange?: TimeRange;
}

// AI Configuration
export interface AIConfiguration {
  provider: AIProvider;
  apiKey?: string;
  model: string;
  baseUrl?: string;
  customPrompts: Record<ReportType, string>;
  timeout?: number;
  maxRetries?: number;
}

// Output Configuration
export interface OutputConfiguration {
  format: OutputFormat;
  outputPath: string;
  filename?: string;
  includeMetadata: boolean;
  styling?: {
    theme?: string;
    customCss?: string;
  };
}

// Report Type Configuration
export interface ReportTypeConfig {
  type: ReportType;
  enabled: boolean;
  schedule?: string; // Cron-like schedule
  customPrompt?: string;
}

// Git data models
export interface GitCommit {
  hash: string;
  author: string;
  date: Date;
  message: string;
  filesChanged: string[];
  additions: number;
  deletions: number;
}

export interface CollectedData {
  source: string;
  timeRange: TimeRange;
  data: GitCommit[];
}

// Main system configuration
export interface SystemConfig {
  dataSources: DataSourceConfig[];
  aiConfig: AIConfiguration;
  outputConfig: OutputConfiguration;
  reportTypes: ReportTypeConfig[];
  version: string;
  lastUpdated: Date;
}