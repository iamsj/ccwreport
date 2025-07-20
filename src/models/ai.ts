// AI processing interfaces and types

import { ReportType, CollectedData, TimeRange } from './config';

/**
 * Processed report structure returned by AI
 */
export interface ProcessedReport {
  title: string;
  summary: string;
  sections: ReportSection[];
  metadata: ReportMetadata;
}

export interface ReportSection {
  title: string;
  content: string;
  priority: number;
}

export interface ReportMetadata {
  generatedAt: Date;
  reportType: ReportType;
  timeRange: TimeRange;
  dataSourcesUsed: string[];
  aiProvider: string;
  model: string;
  processingTime: number; // milliseconds
}

/**
 * AI processing request structure
 */
export interface AIProcessingRequest {
  data: CollectedData[];
  prompt: string;
  reportType: ReportType;
  timeRange: TimeRange;
  metadata?: Record<string, any>;
}

/**
 * AI processing response structure
 */
export interface AIProcessingResponse {
  content: string;
  usage?: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
  model: string;
  finishReason: string;
  metadata?: Record<string, any>;
}

/**
 * AI provider configuration
 */
export interface AIProviderConfig {
  provider: 'openai' | 'anthropic' | 'local';
  apiKey?: string;
  baseUrl?: string;
  model: string;
  timeout?: number;
  maxRetries?: number;
  temperature?: number;
  maxTokens?: number;
  customHeaders?: Record<string, string>;
}

/**
 * AI processing options
 */
export interface AIProcessingOptions {
  timeout?: number;
  retries?: number;
  temperature?: number;
  maxTokens?: number;
  stream?: boolean;
  onProgress?: (progress: AIProcessingProgress) => void;
}

/**
 * AI processing progress information
 */
export interface AIProcessingProgress {
  stage: 'preparing' | 'sending' | 'processing' | 'parsing' | 'complete';
  progress: number; // 0-100
  message?: string;
  tokensUsed?: number;
  estimatedTimeRemaining?: number;
}

/**
 * AI error types
 */
export class AIError extends Error {
  constructor(
    message: string,
    public readonly provider: string,
    public readonly code?: string,
    public readonly statusCode?: number,
    public readonly cause?: Error
  ) {
    super(message);
    this.name = 'AIError';
  }
}

export class AIAuthenticationError extends AIError {
  constructor(message: string, provider: string, cause?: Error) {
    super(message, provider, 'AUTHENTICATION_ERROR', 401, cause);
    this.name = 'AIAuthenticationError';
  }
}

export class AIRateLimitError extends AIError {
  constructor(
    message: string,
    provider: string,
    public readonly retryAfter?: number,
    cause?: Error
  ) {
    super(message, provider, 'RATE_LIMIT_ERROR', 429, cause);
    this.name = 'AIRateLimitError';
  }
}

export class AIQuotaExceededError extends AIError {
  constructor(message: string, provider: string, cause?: Error) {
    super(message, provider, 'QUOTA_EXCEEDED_ERROR', 402, cause);
    this.name = 'AIQuotaExceededError';
  }
}

export class AIConnectionError extends AIError {
  constructor(message: string, provider: string, cause?: Error) {
    super(message, provider, 'CONNECTION_ERROR', undefined, cause);
    this.name = 'AIConnectionError';
  }
}

export class AIProcessingError extends AIError {
  constructor(
    message: string,
    provider: string,
    public readonly request?: AIProcessingRequest,
    cause?: Error
  ) {
    super(message, provider, 'PROCESSING_ERROR', undefined, cause);
    this.name = 'AIProcessingError';
  }
}

export class AIResponseParsingError extends AIError {
  constructor(
    message: string,
    provider: string,
    public readonly rawResponse?: string,
    cause?: Error
  ) {
    super(message, provider, 'RESPONSE_PARSING_ERROR', undefined, cause);
    this.name = 'AIResponseParsingError';
  }
}