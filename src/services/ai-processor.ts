// AI processing interface and base implementation

import {
  AIProcessingRequest,
  AIProcessingResponse,
  AIProviderConfig,
  AIProcessingOptions,
  ProcessedReport,
  AIError,
  AIProcessingProgress,
  AIAuthenticationError,
  AIRateLimitError,
  AIQuotaExceededError,
  AIConnectionError,
  AIProcessingError,
  AIResponseParsingError
} from '../models/ai';
import { CollectedData, ValidationResult, ReportType } from '../models/config';
import { PromptManager, DefaultPromptManager } from './prompt-manager';

/**
 * Retry configuration for AI processing
 */
export interface RetryConfig {
  maxRetries: number;
  baseDelay: number; // milliseconds
  maxDelay: number; // milliseconds
  backoffMultiplier: number;
  retryableErrors: string[]; // Error codes that should trigger retries
}

/**
 * Fallback configuration for AI processing
 */
export interface FallbackConfig {
  enabled: boolean;
  fallbackProviders: AIProviderConfig[];
  simplifiedPrompt?: string;
  fallbackReportTemplate?: ProcessedReport;
}

/**
 * Error logging interface
 */
export interface AIErrorLogger {
  logError(error: AIError, context: AIErrorContext): void;
  logRetryAttempt(attempt: number, error: AIError, nextDelay: number): void;
  logFallbackAttempt(fallbackProvider: string, originalError: AIError): void;
  logProcessingSuccess(provider: string, attempt: number, processingTime: number): void;
}

/**
 * Error context for logging
 */
export interface AIErrorContext {
  requestId: string;
  provider: string;
  model: string;
  attempt: number;
  totalAttempts: number;
  dataSize: number;
  timestamp: Date;
}

/**
 * Main interface for AI processing
 */
export interface AIProcessor {
  /**
   * Process collected data using AI to generate a report
   */
  processData(
    data: CollectedData[],
    prompt: string,
    config: AIProviderConfig,
    options?: AIProcessingOptions
  ): Promise<ProcessedReport>;

  /**
   * Process data using a report type template
   */
  processDataWithTemplate(
    data: CollectedData[],
    reportType: ReportType,
    config: AIProviderConfig,
    customPrompt?: string,
    options?: AIProcessingOptions
  ): Promise<ProcessedReport>;

  /**
   * Generate formatted prompt for given data and report type
   */
  generatePrompt(data: CollectedData[], reportType: ReportType, customTemplate?: string): string;

  /**
   * Validate connection to the AI provider
   */
  validateConnection(config: AIProviderConfig): Promise<boolean>;

  /**
   * Test the AI provider with a simple request
   */
  testProvider(config: AIProviderConfig): Promise<AIProcessingResponse>;

  /**
   * Validate AI provider configuration
   */
  validateConfig(config: AIProviderConfig): ValidationResult;

  /**
   * Get supported models for the provider
   */
  getSupportedModels(config: AIProviderConfig): Promise<string[]>;

  /**
   * Get the prompt manager instance
   */
  getPromptManager(): PromptManager;
}

/**
 * Base interface for AI provider clients
 */
export interface AIProviderClient {
  /** Provider identifier */
  readonly provider: string;

  /** Provider display name */
  readonly name: string;

  /** Provider version */
  readonly version: string;

  /**
   * Send a processing request to the AI provider
   */
  sendRequest(
    request: AIProcessingRequest,
    config: AIProviderConfig,
    options?: AIProcessingOptions
  ): Promise<AIProcessingResponse>;

  /**
   * Validate connection to the provider
   */
  validateConnection(config: AIProviderConfig): Promise<boolean>;

  /**
   * Validate provider-specific configuration
   */
  validateConfig(config: AIProviderConfig): ValidationResult;

  /**
   * Get available models for this provider
   */
  getAvailableModels(config: AIProviderConfig): Promise<string[]>;

  /**
   * Parse and validate the AI response
   */
  parseResponse(rawResponse: string, request: AIProcessingRequest): ProcessedReport;
}

/**
 * Registry for AI provider clients
 */
export interface AIProviderRegistry {
  /**
   * Register an AI provider client
   */
  register(client: AIProviderClient): void;

  /**
   * Get a provider client by name
   */
  getProvider(provider: string): AIProviderClient | undefined;

  /**
   * Get all registered providers
   */
  getProviders(): AIProviderClient[];

  /**
   * Check if a provider is registered
   */
  hasProvider(provider: string): boolean;
}

/**
 * Default error logger implementation
 */
export class ConsoleAIErrorLogger implements AIErrorLogger {
  logError(error: AIError, context: AIErrorContext): void {
    console.error(`[AI Error] ${context.timestamp.toISOString()} - ${context.provider}/${context.model}`, {
      requestId: context.requestId,
      attempt: `${context.attempt}/${context.totalAttempts}`,
      error: error.message,
      code: error.code,
      statusCode: error.statusCode,
      dataSize: context.dataSize
    });
  }

  logRetryAttempt(attempt: number, error: AIError, nextDelay: number): void {
    console.warn(`[AI Retry] Attempt ${attempt} failed: ${error.message}. Retrying in ${nextDelay}ms`);
  }

  logFallbackAttempt(fallbackProvider: string, originalError: AIError): void {
    console.warn(`[AI Fallback] Switching to ${fallbackProvider} after error: ${originalError.message}`);
  }

  logProcessingSuccess(provider: string, attempt: number, processingTime: number): void {
    console.info(`[AI Success] ${provider} completed processing in ${processingTime}ms (attempt ${attempt})`);
  }
}

/**
 * Enhanced AI processor implementation with error handling and fallbacks
 */
export class DefaultAIProcessor implements AIProcessor {
  private registry: AIProviderRegistry;
  private promptManager: PromptManager;
  private retryConfig: RetryConfig;
  private fallbackConfig: FallbackConfig;
  private errorLogger: AIErrorLogger;

  constructor(
    registry: AIProviderRegistry,
    promptManager?: PromptManager,
    retryConfig?: Partial<RetryConfig>,
    fallbackConfig?: Partial<FallbackConfig>,
    errorLogger?: AIErrorLogger
  ) {
    this.registry = registry;
    this.promptManager = promptManager || new DefaultPromptManager();
    this.retryConfig = {
      maxRetries: 3,
      baseDelay: 1000,
      maxDelay: 30000,
      backoffMultiplier: 2,
      retryableErrors: [
        'RATE_LIMIT_ERROR',
        'CONNECTION_ERROR',
        'PROCESSING_ERROR',
        'TIMEOUT_ERROR'
      ],
      ...retryConfig
    };
    this.fallbackConfig = {
      enabled: false,
      fallbackProviders: [],
      ...fallbackConfig
    };
    this.errorLogger = errorLogger || new ConsoleAIErrorLogger();
  }

  async processData(
    data: CollectedData[],
    prompt: string,
    config: AIProviderConfig,
    options?: AIProcessingOptions
  ): Promise<ProcessedReport> {
    const startTime = Date.now();
    const requestId = this.generateRequestId();
    
    // Try primary provider with retry logic
    try {
      return await this.processDataWithRetry(data, prompt, config, options, requestId, startTime);
    } catch (primaryError) {
      // If fallbacks are enabled, try fallback providers
      if (this.fallbackConfig.enabled && this.fallbackConfig.fallbackProviders.length > 0) {
        return await this.processDataWithFallbacks(
          data, 
          prompt, 
          config, 
          options, 
          requestId, 
          startTime, 
          primaryError as AIError
        );
      }
      
      // No fallbacks available, throw the original error
      throw primaryError;
    }
  }

  private async processDataWithRetry(
    data: CollectedData[],
    prompt: string,
    config: AIProviderConfig,
    options?: AIProcessingOptions,
    requestId?: string,
    startTime?: number
  ): Promise<ProcessedReport> {
    const provider = this.registry.getProvider(config.provider);
    if (!provider) {
      throw new AIError(
        `Unsupported AI provider: ${config.provider}`,
        config.provider,
        'UNSUPPORTED_PROVIDER'
      );
    }

    // Validate configuration
    const validation = provider.validateConfig(config);
    if (!validation.isValid) {
      throw new AIError(
        `Invalid configuration: ${validation.errors.join(', ')}`,
        config.provider,
        'INVALID_CONFIG'
      );
    }

    // Create processing request
    const request: AIProcessingRequest = {
      data,
      prompt,
      reportType: data[0]?.timeRange?.type || 'daily',
      timeRange: data[0]?.timeRange || {
        start: new Date(),
        end: new Date(),
        type: 'daily'
      },
      metadata: {
        requestId: requestId || this.generateRequestId(),
        timestamp: new Date().toISOString(),
        dataSourceCount: data.length,
        totalCommits: data.reduce((sum, d) => sum + d.data.length, 0)
      }
    };

    const maxRetries = options?.retries ?? config.maxRetries ?? this.retryConfig.maxRetries;
    let lastError: AIError | undefined;

    for (let attempt = 1; attempt <= maxRetries + 1; attempt++) {
      const errorContext: AIErrorContext = {
        requestId: request.metadata!.requestId as string,
        provider: config.provider,
        model: config.model,
        attempt,
        totalAttempts: maxRetries + 1,
        dataSize: data.reduce((sum, d) => sum + d.data.length, 0),
        timestamp: new Date()
      };

      try {
        // Send request to AI provider
        const response = await provider.sendRequest(request, config, options);
        
        // Parse response into structured report
        const report = provider.parseResponse(response.content, request);
        
        // Add processing metadata
        report.metadata = {
          ...report.metadata,
          aiProvider: config.provider,
          model: config.model,
          processingTime: (startTime ? Date.now() - startTime : 0)
        };

        // Log success
        this.errorLogger.logProcessingSuccess(
          config.provider, 
          attempt, 
          report.metadata.processingTime
        );

        return report;
      } catch (error) {
        const aiError = this.normalizeError(error, config.provider);
        lastError = aiError;

        // Log the error
        this.errorLogger.logError(aiError, errorContext);

        // Check if this is the last attempt
        if (attempt > maxRetries) {
          break;
        }

        // Check if error is retryable
        if (!this.isRetryableError(aiError)) {
          throw aiError;
        }

        // Calculate delay for exponential backoff
        const delay = this.calculateRetryDelay(attempt - 1, aiError);
        
        // Log retry attempt
        this.errorLogger.logRetryAttempt(attempt, aiError, delay);

        // Wait before retrying
        await this.sleep(delay);
      }
    }

    // All retries exhausted
    throw lastError || new AIError(
      'AI processing failed after all retry attempts',
      config.provider,
      'MAX_RETRIES_EXCEEDED'
    );
  }

  private async processDataWithFallbacks(
    data: CollectedData[],
    prompt: string,
    originalConfig: AIProviderConfig,
    options?: AIProcessingOptions,
    requestId?: string,
    startTime?: number,
    originalError?: AIError
  ): Promise<ProcessedReport> {
    for (const fallbackConfig of this.fallbackConfig.fallbackProviders) {
      try {
        this.errorLogger.logFallbackAttempt(fallbackConfig.provider, originalError!);
        
        // Use simplified prompt if configured
        const fallbackPrompt = this.fallbackConfig.simplifiedPrompt || prompt;
        
        return await this.processDataWithRetry(
          data, 
          fallbackPrompt, 
          fallbackConfig, 
          options, 
          requestId, 
          startTime
        );
      } catch (fallbackError) {
        // Continue to next fallback provider
        continue;
      }
    }

    // If we have a fallback template, use it as last resort
    if (this.fallbackConfig.fallbackReportTemplate) {
      const fallbackReport = { ...this.fallbackConfig.fallbackReportTemplate };
      fallbackReport.metadata = {
        ...fallbackReport.metadata,
        generatedAt: new Date(),
        aiProvider: 'fallback',
        model: 'template',
        processingTime: startTime ? Date.now() - startTime : 0
      };
      
      this.errorLogger.logFallbackAttempt('template', originalError!);
      return fallbackReport;
    }

    // All fallbacks failed, throw original error
    throw originalError || new AIError(
      'All AI processing attempts failed',
      originalConfig.provider,
      'ALL_FALLBACKS_FAILED'
    );
  }

  private normalizeError(error: unknown, provider: string): AIError {
    if (error instanceof AIError) {
      return error;
    }
    
    if (error instanceof Error) {
      // Try to determine error type from message or other properties
      const message = error.message.toLowerCase();
      
      if (message.includes('authentication') || message.includes('unauthorized')) {
        return new AIAuthenticationError(error.message, provider, error);
      }
      
      if (message.includes('rate limit') || message.includes('too many requests')) {
        return new AIRateLimitError(error.message, provider, undefined, error);
      }
      
      if (message.includes('quota') || message.includes('billing')) {
        return new AIQuotaExceededError(error.message, provider, error);
      }
      
      if (message.includes('connection') || message.includes('network') || message.includes('timeout')) {
        return new AIConnectionError(error.message, provider, error);
      }
      
      return new AIProcessingError(error.message, provider, undefined, error);
    }
    
    return new AIError(
      `Unknown error: ${String(error)}`,
      provider,
      'UNKNOWN_ERROR'
    );
  }

  private isRetryableError(error: AIError): boolean {
    return this.retryConfig.retryableErrors.includes(error.code || '');
  }

  private calculateRetryDelay(attempt: number, error: AIError): number {
    // For rate limit errors, use the retry-after header if available
    if (error instanceof AIRateLimitError && error.retryAfter) {
      return Math.min(error.retryAfter * 1000, this.retryConfig.maxDelay);
    }

    // Calculate exponential backoff delay
    const delay = this.retryConfig.baseDelay * Math.pow(this.retryConfig.backoffMultiplier, attempt);
    
    // Add jitter to prevent thundering herd
    const jitter = Math.random() * 0.1 * delay;
    
    return Math.min(delay + jitter, this.retryConfig.maxDelay);
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  async validateConnection(config: AIProviderConfig): Promise<boolean> {
    const provider = this.registry.getProvider(config.provider);
    if (!provider) {
      return false;
    }

    try {
      return await provider.validateConnection(config);
    } catch (error) {
      return false;
    }
  }

  async testProvider(config: AIProviderConfig): Promise<AIProcessingResponse> {
    const provider = this.registry.getProvider(config.provider);
    if (!provider) {
      throw new AIError(
        `Unsupported AI provider: ${config.provider}`,
        config.provider,
        'UNSUPPORTED_PROVIDER'
      );
    }

    const testRequest: AIProcessingRequest = {
      data: [],
      prompt: 'Hello, this is a test. Please respond with "Test successful".',
      reportType: 'daily',
      timeRange: {
        start: new Date(),
        end: new Date(),
        type: 'daily'
      }
    };

    return await provider.sendRequest(testRequest, config);
  }

  validateConfig(config: AIProviderConfig): ValidationResult {
    const provider = this.registry.getProvider(config.provider);
    if (!provider) {
      return {
        isValid: false,
        errors: [`Unsupported AI provider: ${config.provider}`]
      };
    }

    return provider.validateConfig(config);
  }

  async processDataWithTemplate(
    data: CollectedData[],
    reportType: ReportType,
    config: AIProviderConfig,
    customPrompt?: string,
    options?: AIProcessingOptions
  ): Promise<ProcessedReport> {
    // Generate the formatted prompt using the template
    const prompt = this.generatePrompt(data, reportType, customPrompt);
    
    // Process the data with the generated prompt
    return await this.processData(data, prompt, config, options);
  }

  generatePrompt(data: CollectedData[], reportType: ReportType, customTemplate?: string): string {
    if (customTemplate) {
      // Use custom template
      return this.promptManager.formatPrompt(customTemplate, data);
    } else {
      // Use default template for the report type
      const template = this.promptManager.getDefaultTemplate(reportType);
      return this.promptManager.formatPrompt(template.template, data);
    }
  }

  getPromptManager(): PromptManager {
    return this.promptManager;
  }

  async getSupportedModels(config: AIProviderConfig): Promise<string[]> {
    const provider = this.registry.getProvider(config.provider);
    if (!provider) {
      throw new AIError(
        `Unsupported AI provider: ${config.provider}`,
        config.provider,
        'UNSUPPORTED_PROVIDER'
      );
    }

    return await provider.getAvailableModels(config);
  }

  private generateRequestId(): string {
    return `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }
}

/**
 * Simple AI provider registry implementation
 */
export class SimpleAIProviderRegistry implements AIProviderRegistry {
  private providers = new Map<string, AIProviderClient>();

  register(client: AIProviderClient): void {
    this.providers.set(client.provider, client);
  }

  getProvider(provider: string): AIProviderClient | undefined {
    return this.providers.get(provider);
  }

  getProviders(): AIProviderClient[] {
    return Array.from(this.providers.values());
  }

  hasProvider(provider: string): boolean {
    return this.providers.has(provider);
  }
}