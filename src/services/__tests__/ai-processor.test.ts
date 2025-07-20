// AI processor unit tests

import { describe, it, expect, beforeEach } from 'vitest';
import {
  DefaultAIProcessor,
  SimpleAIProviderRegistry,
  AIProviderClient
} from '../ai-processor';
import {
  AIProcessingRequest,
  AIProcessingResponse,
  AIProviderConfig,
  ProcessedReport,
  AIError,
  AIProcessingError
} from '../../models/ai';
import { CollectedData, ValidationResult } from '../../models/config';

// Mock AI provider client for testing
class MockAIProviderClient implements AIProviderClient {
  readonly provider = 'mock';
  readonly name = 'Mock AI Provider';
  readonly version = '1.0.0';

  private shouldFail = false;
  private mockResponse: AIProcessingResponse = {
    content: '{"title":"Test Report","summary":"Test summary","sections":[{"title":"Test Section","content":"Test content","priority":1}]}',
    model: 'mock-model',
    finishReason: 'stop'
  };

  setFailure(shouldFail: boolean) {
    this.shouldFail = shouldFail;
  }

  setMockResponse(response: AIProcessingResponse) {
    this.mockResponse = response;
  }

  async sendRequest(
    request: AIProcessingRequest,
    config: AIProviderConfig
  ): Promise<AIProcessingResponse> {
    if (this.shouldFail) {
      throw new AIProcessingError('Mock processing error', this.provider, request);
    }
    return this.mockResponse;
  }

  async validateConnection(config: AIProviderConfig): Promise<boolean> {
    return !this.shouldFail;
  }

  validateConfig(config: AIProviderConfig): ValidationResult {
    const errors: string[] = [];
    
    if (!config.model) {
      errors.push('Model is required');
    }
    
    if (!config.apiKey) {
      errors.push('API key is required');
    }

    return {
      isValid: errors.length === 0,
      errors
    };
  }

  async getAvailableModels(config: AIProviderConfig): Promise<string[]> {
    if (this.shouldFail) {
      throw new AIError('Failed to get models', this.provider);
    }
    return ['mock-model-1', 'mock-model-2'];
  }

  parseResponse(rawResponse: string, request: AIProcessingRequest): ProcessedReport {
    try {
      const parsed = JSON.parse(rawResponse);
      return {
        title: parsed.title,
        summary: parsed.summary,
        sections: parsed.sections,
        metadata: {
          generatedAt: new Date(),
          reportType: request.reportType,
          timeRange: request.timeRange,
          dataSourcesUsed: request.data.map(d => d.source),
          aiProvider: this.provider,
          model: 'mock-model',
          processingTime: 100
        }
      };
    } catch (error) {
      throw new AIError('Failed to parse response', this.provider);
    }
  }
}

describe('DefaultAIProcessor', () => {
  let processor: DefaultAIProcessor;
  let registry: SimpleAIProviderRegistry;
  let mockClient: MockAIProviderClient;
  let mockData: CollectedData[];
  let mockConfig: AIProviderConfig;

  beforeEach(() => {
    registry = new SimpleAIProviderRegistry();
    mockClient = new MockAIProviderClient();
    registry.register(mockClient);
    // Disable retries for existing tests to maintain original behavior
    processor = new DefaultAIProcessor(registry, undefined, { maxRetries: 0 });

    mockData = [
      {
        source: 'test-repo',
        timeRange: {
          start: new Date('2024-01-01'),
          end: new Date('2024-01-02'),
          type: 'daily'
        },
        data: [
          {
            hash: 'abc123',
            author: 'test-user',
            date: new Date('2024-01-01T10:00:00Z'),
            message: 'Test commit message',
            filesChanged: ['file1.ts'],
            additions: 10,
            deletions: 2
          }
        ]
      }
    ];

    mockConfig = {
      provider: 'mock',
      model: 'mock-model',
      apiKey: 'test-key'
    };
  });

  describe('processData', () => {
    it('should successfully process data with valid configuration', async () => {
      const result = await processor.processData(
        mockData,
        'Generate a test report',
        mockConfig
      );

      expect(result).toBeDefined();
      expect(result.title).toBe('Test Report');
      expect(result.summary).toBe('Test summary');
      expect(result.sections).toHaveLength(1);
      expect(result.sections[0].title).toBe('Test Section');
      expect(result.metadata.aiProvider).toBe('mock');
    });

    it('should throw error for unsupported provider', async () => {
      const invalidConfig = { ...mockConfig, provider: 'unsupported' as any };

      await expect(
        processor.processData(mockData, 'Test prompt', invalidConfig)
      ).rejects.toThrow('Unsupported AI provider: unsupported');
    });

    it('should throw error for invalid configuration', async () => {
      const invalidConfig = { ...mockConfig, model: '', apiKey: '' };

      await expect(
        processor.processData(mockData, 'Test prompt', invalidConfig)
      ).rejects.toThrow('Invalid configuration');
    });

    it('should handle AI processing errors', async () => {
      mockClient.setFailure(true);

      await expect(
        processor.processData(mockData, 'Test prompt', mockConfig)
      ).rejects.toThrow('Mock processing error');
    });

    it('should generate request metadata', async () => {
      const result = await processor.processData(
        mockData,
        'Generate a test report',
        mockConfig
      );

      expect(result.metadata.dataSourcesUsed).toEqual(['test-repo']);
      expect(result.metadata.reportType).toBe('daily');
      expect(result.metadata.processingTime).toBeGreaterThanOrEqual(0);
    });
  });

  describe('validateConnection', () => {
    it('should return true for valid connection', async () => {
      const result = await processor.validateConnection(mockConfig);
      expect(result).toBe(true);
    });

    it('should return false for invalid connection', async () => {
      mockClient.setFailure(true);
      const result = await processor.validateConnection(mockConfig);
      expect(result).toBe(false);
    });

    it('should return false for unsupported provider', async () => {
      const invalidConfig = { ...mockConfig, provider: 'unsupported' as any };
      const result = await processor.validateConnection(invalidConfig);
      expect(result).toBe(false);
    });
  });

  describe('testProvider', () => {
    it('should successfully test provider', async () => {
      const result = await processor.testProvider(mockConfig);
      expect(result).toBeDefined();
      expect(result.model).toBe('mock-model');
    });

    it('should throw error for unsupported provider', async () => {
      const invalidConfig = { ...mockConfig, provider: 'unsupported' as any };

      await expect(
        processor.testProvider(invalidConfig)
      ).rejects.toThrow('Unsupported AI provider: unsupported');
    });
  });

  describe('validateConfig', () => {
    it('should validate correct configuration', () => {
      const result = processor.validateConfig(mockConfig);
      expect(result.isValid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should return errors for invalid configuration', () => {
      const invalidConfig = { ...mockConfig, model: '', apiKey: '' };
      const result = processor.validateConfig(invalidConfig);
      
      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('Model is required');
      expect(result.errors).toContain('API key is required');
    });

    it('should return error for unsupported provider', () => {
      const invalidConfig = { ...mockConfig, provider: 'unsupported' as any };
      const result = processor.validateConfig(invalidConfig);
      
      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('Unsupported AI provider: unsupported');
    });
  });

  describe('getSupportedModels', () => {
    it('should return available models', async () => {
      const models = await processor.getSupportedModels(mockConfig);
      expect(models).toEqual(['mock-model-1', 'mock-model-2']);
    });

    it('should throw error for unsupported provider', async () => {
      const invalidConfig = { ...mockConfig, provider: 'unsupported' as any };

      await expect(
        processor.getSupportedModels(invalidConfig)
      ).rejects.toThrow('Unsupported AI provider: unsupported');
    });

    it('should handle provider errors', async () => {
      mockClient.setFailure(true);

      await expect(
        processor.getSupportedModels(mockConfig)
      ).rejects.toThrow('Failed to get models');
    });
  });

  describe('processDataWithTemplate', () => {
    it('should process data using default template for report type', async () => {
      const result = await processor.processDataWithTemplate(
        mockData,
        'daily',
        mockConfig
      );

      expect(result).toBeDefined();
      expect(result.title).toBe('Test Report');
      expect(result.metadata.reportType).toBe('daily');
    });

    it('should process data using custom template', async () => {
      const customTemplate = 'Custom template with {{totalCommits}} commits and {{dateRange}}';
      
      const result = await processor.processDataWithTemplate(
        mockData,
        'weekly',
        mockConfig,
        customTemplate
      );

      expect(result).toBeDefined();
      expect(result.title).toBe('Test Report');
    });

    it('should handle processing errors in template mode', async () => {
      mockClient.setFailure(true);

      await expect(
        processor.processDataWithTemplate(mockData, 'daily', mockConfig)
      ).rejects.toThrow('Mock processing error');
    });
  });

  describe('generatePrompt', () => {
    it('should generate prompt using default template', () => {
      const prompt = processor.generatePrompt(mockData, 'daily');
      
      expect(prompt).toContain('daily development report');
      expect(prompt).toContain('Total Commits:** 1'); // totalCommits
      expect(prompt).toContain('test-user'); // author
      expect(prompt).toContain('Test commit message'); // commit message
    });

    it('should generate prompt using custom template', () => {
      const customTemplate = 'Custom report for {{dateRange}} with {{totalCommits}} commits from {{authors}}';
      const prompt = processor.generatePrompt(mockData, 'weekly', customTemplate);
      
      expect(prompt).toContain('Custom report for');
      expect(prompt).toContain('1 commits');
      expect(prompt).toContain('test-user');
    });

    it('should handle different report types', () => {
      const dailyPrompt = processor.generatePrompt(mockData, 'daily');
      const weeklyPrompt = processor.generatePrompt(mockData, 'weekly');
      const monthlyPrompt = processor.generatePrompt(mockData, 'monthly');
      
      expect(dailyPrompt).toContain('daily development report');
      expect(weeklyPrompt).toContain('weekly development report');
      expect(monthlyPrompt).toContain('monthly development report');
    });
  });

  describe('getPromptManager', () => {
    it('should return the prompt manager instance', () => {
      const promptManager = processor.getPromptManager();
      expect(promptManager).toBeDefined();
      expect(typeof promptManager.formatPrompt).toBe('function');
      expect(typeof promptManager.generateVariables).toBe('function');
    });

    it('should return the same instance on multiple calls', () => {
      const promptManager1 = processor.getPromptManager();
      const promptManager2 = processor.getPromptManager();
      expect(promptManager1).toBe(promptManager2);
    });
  });
});

describe('SimpleAIProviderRegistry', () => {
  let registry: SimpleAIProviderRegistry;
  let mockClient: MockAIProviderClient;

  beforeEach(() => {
    registry = new SimpleAIProviderRegistry();
    mockClient = new MockAIProviderClient();
  });

  describe('register', () => {
    it('should register a provider client', () => {
      registry.register(mockClient);
      expect(registry.hasProvider('mock')).toBe(true);
    });

    it('should overwrite existing provider with same name', () => {
      const anotherMockClient = new MockAIProviderClient();
      
      registry.register(mockClient);
      registry.register(anotherMockClient);
      
      expect(registry.getProvider('mock')).toBe(anotherMockClient);
    });
  });

  describe('getProvider', () => {
    it('should return registered provider', () => {
      registry.register(mockClient);
      const provider = registry.getProvider('mock');
      expect(provider).toBe(mockClient);
    });

    it('should return undefined for unregistered provider', () => {
      const provider = registry.getProvider('nonexistent');
      expect(provider).toBeUndefined();
    });
  });

  describe('getProviders', () => {
    it('should return all registered providers', () => {
      registry.register(mockClient);
      const providers = registry.getProviders();
      expect(providers).toHaveLength(1);
      expect(providers[0]).toBe(mockClient);
    });

    it('should return empty array when no providers registered', () => {
      const providers = registry.getProviders();
      expect(providers).toHaveLength(0);
    });
  });

  describe('hasProvider', () => {
    it('should return true for registered provider', () => {
      registry.register(mockClient);
      expect(registry.hasProvider('mock')).toBe(true);
    });

    it('should return false for unregistered provider', () => {
      expect(registry.hasProvider('nonexistent')).toBe(false);
    });
  });
});