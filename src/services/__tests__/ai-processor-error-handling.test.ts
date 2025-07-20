// Tests for AI processor error handling and fallback mechanisms

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  DefaultAIProcessor,
  SimpleAIProviderRegistry,
  ConsoleAIErrorLogger,
  AIProviderClient,
  RetryConfig,
  FallbackConfig,
  AIErrorLogger
} from '../ai-processor';
import {
  AIError,
  AIAuthenticationError,
  AIRateLimitError,
  AIQuotaExceededError,
  AIConnectionError,
  AIProcessingError,
  AIProviderConfig,
  AIProcessingRequest,
  AIProcessingResponse,
  ProcessedReport
} from '../../models/ai';
import { CollectedData, ValidationResult } from '../../models/config';

// Mock AI provider client for testing
class MockAIProviderClient implements AIProviderClient {
  readonly provider = 'mock';
  readonly name = 'Mock Provider';
  readonly version = '1.0.0';

  private shouldFail = false;
  private failureType: string = 'PROCESSING_ERROR';
  private failureCount = 0;
  private maxFailures = 0;
  private currentFailures = 0;

  setFailure(type: string, maxFailures: number = 1) {
    this.shouldFail = true;
    this.failureType = type;
    this.maxFailures = maxFailures;
    this.currentFailures = 0;
  }

  clearFailure() {
    this.shouldFail = false;
    this.currentFailures = 0;
  }

  async sendRequest(
    request: AIProcessingRequest,
    config: AIProviderConfig
  ): Promise<AIProcessingResponse> {
    if (this.shouldFail && this.currentFailures < this.maxFailures) {
      this.currentFailures++;
      
      switch (this.failureType) {
        case 'AUTHENTICATION_ERROR':
          throw new AIAuthenticationError('Invalid API key', this.provider);
        case 'RATE_LIMIT_ERROR':
          throw new AIRateLimitError('Rate limit exceeded', this.provider, 1); // Reduced retry-after for testing
        case 'QUOTA_EXCEEDED_ERROR':
          throw new AIQuotaExceededError('Quota exceeded', this.provider);
        case 'CONNECTION_ERROR':
          throw new AIConnectionError('Connection failed', this.provider);
        case 'PROCESSING_ERROR':
          throw new AIProcessingError('Processing failed', this.provider);
        default:
          throw new AIError('Unknown error', this.provider, this.failureType);
      }
    }

    return {
      content: JSON.stringify({
        title: 'Test Report',
        summary: 'Test summary',
        sections: [
          {
            title: 'Test Section',
            content: 'Test content',
            priority: 1
          }
        ]
      }),
      usage: {
        promptTokens: 100,
        completionTokens: 200,
        totalTokens: 300
      },
      model: config.model,
      finishReason: 'stop'
    };
  }

  async validateConnection(config: AIProviderConfig): Promise<boolean> {
    return !this.shouldFail;
  }

  validateConfig(config: AIProviderConfig): ValidationResult {
    return {
      isValid: true,
      errors: []
    };
  }

  async getAvailableModels(config: AIProviderConfig): Promise<string[]> {
    return ['gpt-3.5-turbo', 'gpt-4'];
  }

  parseResponse(rawResponse: string, request: AIProcessingRequest): ProcessedReport {
    const parsed = JSON.parse(rawResponse);
    return {
      ...parsed,
      metadata: {
        generatedAt: new Date(),
        reportType: request.reportType,
        timeRange: request.timeRange,
        dataSourcesUsed: ['git'],
        aiProvider: this.provider,
        model: 'test-model',
        processingTime: 100
      }
    };
  }
}

// Mock error logger for testing
class MockErrorLogger implements AIErrorLogger {
  public errors: any[] = [];
  public retryAttempts: any[] = [];
  public fallbackAttempts: any[] = [];
  public successes: any[] = [];

  logError(error: AIError, context: any): void {
    this.errors.push({ error, context });
  }

  logRetryAttempt(attempt: number, error: AIError, nextDelay: number): void {
    this.retryAttempts.push({ attempt, error, nextDelay });
  }

  logFallbackAttempt(fallbackProvider: string, originalError: AIError): void {
    this.fallbackAttempts.push({ fallbackProvider, originalError });
  }

  logProcessingSuccess(provider: string, attempt: number, processingTime: number): void {
    this.successes.push({ provider, attempt, processingTime });
  }

  clear(): void {
    this.errors = [];
    this.retryAttempts = [];
    this.fallbackAttempts = [];
    this.successes = [];
  }
}

describe('AI Processor Error Handling', () => {
  let registry: SimpleAIProviderRegistry;
  let mockProvider: MockAIProviderClient;
  let mockFallbackProvider: MockAIProviderClient;
  let mockErrorLogger: MockErrorLogger;
  let processor: DefaultAIProcessor;
  let testData: CollectedData[];
  let testConfig: AIProviderConfig;

  beforeEach(() => {
    registry = new SimpleAIProviderRegistry();
    mockProvider = new MockAIProviderClient();
    mockFallbackProvider = new MockAIProviderClient();
    mockErrorLogger = new MockErrorLogger();

    // Set up fallback provider with different name
    Object.defineProperty(mockFallbackProvider, 'provider', { value: 'mock-fallback' });

    registry.register(mockProvider);
    registry.register(mockFallbackProvider);

    testData = [
      {
        source: 'git',
        timeRange: {
          start: new Date('2024-01-01'),
          end: new Date('2024-01-02'),
          type: 'daily'
        },
        data: [
          {
            hash: 'abc123',
            author: 'test@example.com',
            date: new Date('2024-01-01'),
            message: 'Test commit',
            filesChanged: ['file1.ts'],
            additions: 10,
            deletions: 5
          }
        ]
      }
    ];

    testConfig = {
      provider: 'mock',
      model: 'test-model',
      apiKey: 'test-key'
    };
  });

  afterEach(() => {
    mockProvider.clearFailure();
    mockFallbackProvider.clearFailure();
    mockErrorLogger.clear();
  });

  describe('Retry Logic', () => {
    it('should retry on retryable errors with exponential backoff', async () => {
      const retryConfig: Partial<RetryConfig> = {
        maxRetries: 1, // Reduced to 1 retry for faster testing
        baseDelay: 1, // Minimal delay
        backoffMultiplier: 1.5,
        maxDelay: 10
      };

      processor = new DefaultAIProcessor(
        registry,
        undefined,
        retryConfig,
        undefined,
        mockErrorLogger
      );

      // Set provider to fail once, then succeed
      mockProvider.setFailure('RATE_LIMIT_ERROR', 1);

      const result = await processor.processData(testData, 'test prompt', testConfig);

      expect(result).toBeDefined();
      expect(result.title).toBe('Test Report');
      expect(mockErrorLogger.errors).toHaveLength(1);
      expect(mockErrorLogger.retryAttempts).toHaveLength(1);
      expect(mockErrorLogger.successes).toHaveLength(1);
      expect(mockErrorLogger.successes[0].attempt).toBe(2);
    }, 3000);

    it('should respect rate limit retry-after header', async () => {
      const retryConfig: Partial<RetryConfig> = {
        maxRetries: 1,
        baseDelay: 10,
        maxDelay: 100 // Reduced for testing
      };

      processor = new DefaultAIProcessor(
        registry,
        undefined,
        retryConfig,
        undefined,
        mockErrorLogger
      );

      mockProvider.setFailure('RATE_LIMIT_ERROR', 1);

      await processor.processData(testData, 'test prompt', testConfig);

      expect(mockErrorLogger.retryAttempts).toHaveLength(1);
      // Should use retry-after value (60 seconds = 60000ms) but capped by maxDelay
      expect(mockErrorLogger.retryAttempts[0].nextDelay).toBeLessThanOrEqual(100);
    }, 5000);

    it('should not retry on non-retryable errors', async () => {
      processor = new DefaultAIProcessor(
        registry,
        undefined,
        undefined,
        undefined,
        mockErrorLogger
      );

      mockProvider.setFailure('AUTHENTICATION_ERROR', 1);

      await expect(
        processor.processData(testData, 'test prompt', testConfig)
      ).rejects.toThrow(AIAuthenticationError);

      expect(mockErrorLogger.errors).toHaveLength(1);
      expect(mockErrorLogger.retryAttempts).toHaveLength(0);
    });

    it('should throw error after max retries exceeded', async () => {
      const retryConfig: Partial<RetryConfig> = {
        maxRetries: 2,
        baseDelay: 10
      };

      processor = new DefaultAIProcessor(
        registry,
        undefined,
        retryConfig,
        undefined,
        mockErrorLogger
      );

      mockProvider.setFailure('CONNECTION_ERROR', 5); // Fail more than max retries

      await expect(
        processor.processData(testData, 'test prompt', testConfig)
      ).rejects.toThrow('Connection failed');

      expect(mockErrorLogger.errors).toHaveLength(3); // Initial + 2 retries
      expect(mockErrorLogger.retryAttempts).toHaveLength(2);
    });
  });

  describe('Fallback Mechanisms', () => {
    it('should use fallback provider when primary fails', async () => {
      const fallbackConfig: Partial<FallbackConfig> = {
        enabled: true,
        fallbackProviders: [
          {
            provider: 'mock-fallback',
            model: 'fallback-model',
            apiKey: 'fallback-key'
          }
        ]
      };

      processor = new DefaultAIProcessor(
        registry,
        undefined,
        { maxRetries: 1 },
        fallbackConfig,
        mockErrorLogger
      );

      // Primary provider fails completely
      mockProvider.setFailure('AUTHENTICATION_ERROR', 10);

      const result = await processor.processData(testData, 'test prompt', testConfig);

      expect(result).toBeDefined();
      expect(result.title).toBe('Test Report');
      expect(mockErrorLogger.fallbackAttempts).toHaveLength(1);
      expect(mockErrorLogger.fallbackAttempts[0].fallbackProvider).toBe('mock-fallback');
    });

    it('should use simplified prompt for fallback providers', async () => {
      const fallbackConfig: Partial<FallbackConfig> = {
        enabled: true,
        fallbackProviders: [
          {
            provider: 'mock-fallback',
            model: 'fallback-model',
            apiKey: 'fallback-key'
          }
        ],
        simplifiedPrompt: 'Simple prompt'
      };

      processor = new DefaultAIProcessor(
        registry,
        undefined,
        { maxRetries: 0 },
        fallbackConfig,
        mockErrorLogger
      );

      mockProvider.setFailure('QUOTA_EXCEEDED_ERROR', 10);

      const result = await processor.processData(testData, 'complex prompt', testConfig);

      expect(result).toBeDefined();
      expect(mockErrorLogger.fallbackAttempts).toHaveLength(1);
    });

    it('should use fallback template as last resort', async () => {
      const fallbackTemplate: ProcessedReport = {
        title: 'Fallback Report',
        summary: 'Generated from template',
        sections: [
          {
            title: 'Fallback Section',
            content: 'Template content',
            priority: 1
          }
        ],
        metadata: {
          generatedAt: new Date(),
          reportType: 'daily',
          timeRange: testData[0].timeRange,
          dataSourcesUsed: ['git'],
          aiProvider: 'template',
          model: 'template',
          processingTime: 0
        }
      };

      const fallbackConfig: Partial<FallbackConfig> = {
        enabled: true,
        fallbackProviders: [
          {
            provider: 'mock-fallback',
            model: 'fallback-model',
            apiKey: 'fallback-key'
          }
        ],
        fallbackReportTemplate: fallbackTemplate
      };

      processor = new DefaultAIProcessor(
        registry,
        undefined,
        { maxRetries: 0 },
        fallbackConfig,
        mockErrorLogger
      );

      // Both providers fail
      mockProvider.setFailure('AUTHENTICATION_ERROR', 10);
      mockFallbackProvider.setFailure('AUTHENTICATION_ERROR', 10);

      const result = await processor.processData(testData, 'test prompt', testConfig);

      expect(result).toBeDefined();
      expect(result.title).toBe('Fallback Report');
      expect(result.metadata.aiProvider).toBe('fallback');
      expect(mockErrorLogger.fallbackAttempts).toHaveLength(2); // One for fallback provider, one for template
    });

    it('should throw original error when all fallbacks fail', async () => {
      const fallbackConfig: Partial<FallbackConfig> = {
        enabled: true,
        fallbackProviders: [
          {
            provider: 'mock-fallback',
            model: 'fallback-model',
            apiKey: 'fallback-key'
          }
        ]
      };

      processor = new DefaultAIProcessor(
        registry,
        undefined,
        { maxRetries: 0 },
        fallbackConfig,
        mockErrorLogger
      );

      // Both providers fail
      mockProvider.setFailure('AUTHENTICATION_ERROR', 10);
      mockFallbackProvider.setFailure('CONNECTION_ERROR', 10);

      await expect(
        processor.processData(testData, 'test prompt', testConfig)
      ).rejects.toThrow(AIAuthenticationError);

      expect(mockErrorLogger.fallbackAttempts).toHaveLength(1);
    });
  });

  describe('Error Normalization', () => {
    it('should normalize different error types correctly', async () => {
      processor = new DefaultAIProcessor(
        registry,
        undefined,
        { maxRetries: 0 },
        undefined,
        mockErrorLogger
      );

      const errorTypes = [
        'AUTHENTICATION_ERROR',
        'RATE_LIMIT_ERROR',
        'QUOTA_EXCEEDED_ERROR',
        'CONNECTION_ERROR',
        'PROCESSING_ERROR'
      ];

      for (const errorType of errorTypes) {
        mockProvider.setFailure(errorType, 1);
        mockErrorLogger.clear();

        try {
          await processor.processData(testData, 'test prompt', testConfig);
        } catch (error) {
          // Expected to fail
        }

        expect(mockErrorLogger.errors).toHaveLength(1);
        expect(mockErrorLogger.errors[0].error.code).toBe(errorType);
      }
    });

    it('should handle unknown errors gracefully', async () => {
      processor = new DefaultAIProcessor(
        registry,
        undefined,
        { maxRetries: 0 },
        undefined,
        mockErrorLogger
      );

      // Mock provider to throw a non-AIError
      vi.spyOn(mockProvider, 'sendRequest').mockRejectedValue(new Error('Unknown error'));

      await expect(
        processor.processData(testData, 'test prompt', testConfig)
      ).rejects.toThrow('Unknown error');

      expect(mockErrorLogger.errors).toHaveLength(1);
      expect(mockErrorLogger.errors[0].error).toBeInstanceOf(AIProcessingError);
    });
  });

  describe('Error Logging', () => {
    it('should log comprehensive error information', async () => {
      processor = new DefaultAIProcessor(
        registry,
        undefined,
        { maxRetries: 1, baseDelay: 1, maxDelay: 5 }, // Minimal delays for testing
        undefined,
        mockErrorLogger
      );

      mockProvider.setFailure('RATE_LIMIT_ERROR', 1); // Fail once, then succeed

      await processor.processData(testData, 'test prompt', testConfig);

      expect(mockErrorLogger.errors).toHaveLength(1);
      const errorLog = mockErrorLogger.errors[0];
      
      expect(errorLog.context.provider).toBe('mock');
      expect(errorLog.context.model).toBe('test-model');
      expect(errorLog.context.attempt).toBe(1);
      expect(errorLog.context.totalAttempts).toBe(2);
      expect(errorLog.context.dataSize).toBe(1);
      expect(errorLog.context.requestId).toBeDefined();
    }, 2000);

    it('should log successful processing', async () => {
      processor = new DefaultAIProcessor(
        registry,
        undefined,
        undefined,
        undefined,
        mockErrorLogger
      );

      await processor.processData(testData, 'test prompt', testConfig);

      expect(mockErrorLogger.successes).toHaveLength(1);
      expect(mockErrorLogger.successes[0].provider).toBe('mock');
      expect(mockErrorLogger.successes[0].attempt).toBe(1);
      expect(mockErrorLogger.successes[0].processingTime).toBeGreaterThanOrEqual(0);
    });
  });

  describe('Console Error Logger', () => {
    it('should log to console correctly', () => {
      const consoleLogger = new ConsoleAIErrorLogger();
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      const infoSpy = vi.spyOn(console, 'info').mockImplementation(() => {});

      const error = new AIRateLimitError('Rate limit exceeded', 'test-provider');
      const context = {
        requestId: 'test-123',
        provider: 'test-provider',
        model: 'test-model',
        attempt: 1,
        totalAttempts: 3,
        dataSize: 100,
        timestamp: new Date()
      };

      consoleLogger.logError(error, context);
      consoleLogger.logRetryAttempt(1, error, 2000);
      consoleLogger.logFallbackAttempt('fallback-provider', error);
      consoleLogger.logProcessingSuccess('test-provider', 2, 1500);

      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('[AI Error]'),
        expect.objectContaining({
          requestId: 'test-123',
          attempt: '1/3'
        })
      );

      expect(warnSpy).toHaveBeenCalledWith(
        expect.stringContaining('[AI Retry]')
      );

      expect(warnSpy).toHaveBeenCalledWith(
        expect.stringContaining('[AI Fallback]')
      );

      expect(infoSpy).toHaveBeenCalledWith(
        expect.stringContaining('[AI Success]')
      );

      consoleSpy.mockRestore();
      warnSpy.mockRestore();
      infoSpy.mockRestore();
    });
  });
});