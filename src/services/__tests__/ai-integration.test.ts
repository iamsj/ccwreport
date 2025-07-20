// AI integration tests

import { describe, it, expect } from 'vitest';
import { createAIProcessor, createCustomAIProcessor, getDefaultAIConfigs } from '../ai-factory';
import { CollectedData } from '../../models/config';

describe('AI Integration', () => {
  const mockData: CollectedData[] = [
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
          message: 'Add new feature for user authentication',
          filesChanged: ['src/auth.ts', 'src/user.ts'],
          additions: 25,
          deletions: 3
        },
        {
          hash: 'def456',
          author: 'test-user',
          date: new Date('2024-01-01T14:30:00Z'),
          message: 'Fix bug in login validation',
          filesChanged: ['src/auth.ts'],
          additions: 5,
          deletions: 2
        }
      ]
    }
  ];

  describe('AI Processor Factory', () => {
    it('should create AI processor with all providers', () => {
      const processor = createAIProcessor();
      expect(processor).toBeDefined();
    });

    it('should create custom AI processor with specific providers', () => {
      const processor = createCustomAIProcessor(['openai', 'anthropic']);
      expect(processor).toBeDefined();
    });

    it('should validate configurations for all providers', () => {
      const processor = createAIProcessor();
      const configs = getDefaultAIConfigs();

      // Test OpenAI config validation
      const openaiValidation = processor.validateConfig(configs.openai);
      expect(openaiValidation.isValid).toBe(true);

      // Test Anthropic config validation
      const anthropicValidation = processor.validateConfig(configs.anthropic);
      expect(anthropicValidation.isValid).toBe(true);

      // Test Local config validation
      const localValidation = processor.validateConfig(configs.local);
      expect(localValidation.isValid).toBe(true);
    });

    it('should handle invalid provider gracefully', () => {
      const processor = createAIProcessor();
      const invalidConfig = {
        provider: 'invalid-provider' as any,
        model: 'test-model',
        apiKey: 'test-key'
      };

      const validation = processor.validateConfig(invalidConfig);
      expect(validation.isValid).toBe(false);
      expect(validation.errors).toContain('Unsupported AI provider: invalid-provider');
    });
  });

  describe('Provider Configuration Validation', () => {
    it('should validate OpenAI configuration requirements', () => {
      const processor = createCustomAIProcessor(['openai']);
      
      // Valid config
      const validConfig = {
        provider: 'openai' as const,
        model: 'gpt-3.5-turbo',
        apiKey: 'test-key'
      };
      
      const validation = processor.validateConfig(validConfig);
      expect(validation.isValid).toBe(true);

      // Invalid config - missing API key
      const invalidConfig = {
        provider: 'openai' as const,
        model: 'gpt-3.5-turbo',
        apiKey: ''
      };
      
      const invalidValidation = processor.validateConfig(invalidConfig);
      expect(invalidValidation.isValid).toBe(false);
      expect(invalidValidation.errors).toContain('OpenAI API key is required');
    });

    it('should validate Anthropic configuration requirements', () => {
      const processor = createCustomAIProcessor(['anthropic']);
      
      // Valid config
      const validConfig = {
        provider: 'anthropic' as const,
        model: 'claude-3-sonnet-20240229',
        apiKey: 'test-key'
      };
      
      const validation = processor.validateConfig(validConfig);
      expect(validation.isValid).toBe(true);

      // Invalid config - wrong model format
      const invalidConfig = {
        provider: 'anthropic' as const,
        model: 'gpt-3.5-turbo',
        apiKey: 'test-key'
      };
      
      const invalidValidation = processor.validateConfig(invalidConfig);
      expect(invalidValidation.isValid).toBe(false);
      expect(invalidValidation.errors).toContain('Anthropic model name should start with "claude-"');
    });

    it('should validate Local model configuration requirements', () => {
      const processor = createCustomAIProcessor(['local']);
      
      // Valid config
      const validConfig = {
        provider: 'local' as const,
        model: 'llama2:7b',
        baseUrl: 'http://localhost:11434'
      };
      
      const validation = processor.validateConfig(validConfig);
      expect(validation.isValid).toBe(true);

      // Invalid config - missing base URL
      const invalidConfig = {
        provider: 'local' as const,
        model: 'llama2:7b'
      };
      
      const invalidValidation = processor.validateConfig(invalidConfig);
      expect(invalidValidation.isValid).toBe(false);
      expect(invalidValidation.errors).toContain('Base URL is required for local models (e.g., http://localhost:11434)');
    });
  });

  describe('Error Handling', () => {
    it('should handle unsupported provider gracefully', async () => {
      const processor = createAIProcessor();
      const invalidConfig = {
        provider: 'unsupported' as any,
        model: 'test-model',
        apiKey: 'test-key'
      };

      await expect(
        processor.processData(mockData, 'Generate report', invalidConfig)
      ).rejects.toThrow('Unsupported AI provider: unsupported');
    });

    it('should handle invalid configuration gracefully', async () => {
      const processor = createCustomAIProcessor(['openai']);
      const invalidConfig = {
        provider: 'openai' as const,
        model: '',
        apiKey: ''
      };

      await expect(
        processor.processData(mockData, 'Generate report', invalidConfig)
      ).rejects.toThrow('Invalid configuration');
    });
  });

  describe('Provider Registry', () => {
    it('should support checking for provider availability', () => {
      const processor = createCustomAIProcessor(['openai', 'anthropic']);
      
      // These should be available
      const openaiValidation = processor.validateConfig({
        provider: 'openai',
        model: 'gpt-3.5-turbo',
        apiKey: 'test'
      });
      expect(openaiValidation.isValid).toBe(true);

      const anthropicValidation = processor.validateConfig({
        provider: 'anthropic',
        model: 'claude-3-sonnet-20240229',
        apiKey: 'test'
      });
      expect(anthropicValidation.isValid).toBe(true);

      // Local should not be available in this processor
      const localValidation = processor.validateConfig({
        provider: 'local',
        model: 'llama2:7b',
        baseUrl: 'http://localhost:11434'
      });
      expect(localValidation.isValid).toBe(false);
      expect(localValidation.errors).toContain('Unsupported AI provider: local');
    });
  });
});