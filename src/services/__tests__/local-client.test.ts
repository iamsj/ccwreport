// Local AI client unit tests

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import axios from 'axios';
import { LocalClient } from '../ai-providers/local-client';
import {
  AIProcessingRequest,
  AIProviderConfig,
  AIConnectionError,
  AIProcessingError
} from '../../models/ai';

// Mock axios
vi.mock('axios');
const mockedAxios = vi.mocked(axios);

describe('LocalClient', () => {
  let client: LocalClient;
  let mockConfig: AIProviderConfig;
  let mockRequest: AIProcessingRequest;

  beforeEach(() => {
    client = new LocalClient();
    
    mockConfig = {
      provider: 'local',
      model: 'llama2:7b',
      baseUrl: 'http://localhost:11434',
      temperature: 0.7,
      maxTokens: 1000
    };

    mockRequest = {
      data: [
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
      ],
      prompt: 'Generate a daily report',
      reportType: 'daily',
      timeRange: {
        start: new Date('2024-01-01'),
        end: new Date('2024-01-02'),
        type: 'daily'
      }
    };

    // Reset axios mock
    vi.clearAllMocks();
    mockedAxios.create.mockReturnValue(mockedAxios as any);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('sendRequest', () => {
    it('should successfully send request using OpenAI-compatible format', async () => {
      const mockResponse = {
        data: {
          choices: [
            {
              message: {
                content: '{"title":"Daily Report","summary":"Test summary","sections":[{"title":"Overview","content":"Test content","priority":1}]}'
              },
              finish_reason: 'stop'
            }
          ],
          usage: {
            prompt_tokens: 100,
            completion_tokens: 200,
            total_tokens: 300
          },
          model: 'llama2:7b',
          id: 'chatcmpl-123'
        }
      };

      mockedAxios.post.mockResolvedValueOnce(mockResponse);

      const result = await client.sendRequest(mockRequest, mockConfig);

      expect(result.content).toContain('Daily Report');
      expect(result.usage?.totalTokens).toBe(300);
      expect(result.model).toBe('llama2:7b');
      expect(result.finishReason).toBe('stop');
      expect(mockedAxios.post).toHaveBeenCalledWith(
        'http://localhost:11434/v1/chat/completions',
        expect.objectContaining({
          model: 'llama2:7b',
          temperature: 0.7,
          max_tokens: 1000
        }),
        expect.any(Object)
      );
    });

    it('should fallback to Ollama format when OpenAI format fails', async () => {
      const openaiError = new Error('OpenAI format not supported');
      const ollamaResponse = {
        data: {
          response: '{"title":"Daily Report","summary":"Test summary","sections":[]}',
          model: 'llama2:7b',
          done: true,
          prompt_eval_count: 100,
          eval_count: 200,
          total_duration: 5000000000,
          load_duration: 1000000000,
          prompt_eval_duration: 2000000000,
          eval_duration: 2000000000
        }
      };

      mockedAxios.post
        .mockRejectedValueOnce(openaiError)
        .mockResolvedValueOnce(ollamaResponse);

      const result = await client.sendRequest(mockRequest, mockConfig);

      expect(result.content).toContain('Daily Report');
      expect(result.usage?.promptTokens).toBe(100);
      expect(result.usage?.completionTokens).toBe(200);
      expect(result.usage?.totalTokens).toBe(300);
      expect(result.finishReason).toBe('stop');
      expect(mockedAxios.post).toHaveBeenCalledTimes(2);
      expect(mockedAxios.post).toHaveBeenLastCalledWith(
        'http://localhost:11434/api/generate',
        expect.objectContaining({
          model: 'llama2:7b',
          stream: false
        }),
        expect.any(Object)
      );
    });

    it('should use custom base URL', async () => {
      const customConfig = {
        ...mockConfig,
        baseUrl: 'http://custom-local:8080'
      };

      const mockResponse = {
        data: {
          choices: [{ message: { content: 'test response' }, finish_reason: 'stop' }],
          model: 'llama2:7b'
        }
      };

      mockedAxios.post.mockResolvedValueOnce(mockResponse);

      await client.sendRequest(mockRequest, customConfig);

      expect(mockedAxios.post).toHaveBeenCalledWith(
        'http://custom-local:8080/v1/chat/completions',
        expect.any(Object),
        expect.any(Object)
      );
    });

    it('should handle connection refused error', async () => {
      const connectionError = {
        code: 'ECONNREFUSED',
        message: 'Connection refused'
      };

      mockedAxios.post.mockRejectedValueOnce(connectionError);
      mockedAxios.isAxiosError.mockReturnValueOnce(true);

      await expect(
        client.sendRequest(mockRequest, mockConfig)
      ).rejects.toThrow(AIConnectionError);
    });

    it('should handle server errors', async () => {
      const serverError = {
        response: {
          status: 500,
          data: {
            error: {
              message: 'Internal server error'
            }
          }
        }
      };

      mockedAxios.post.mockRejectedValueOnce(serverError);
      mockedAxios.isAxiosError.mockReturnValueOnce(true);

      await expect(
        client.sendRequest(mockRequest, mockConfig)
      ).rejects.toThrow(AIConnectionError);
    });

    it('should handle missing choices in OpenAI format', async () => {
      const mockResponse = {
        data: {
          choices: [],
          model: 'llama2:7b'
        }
      };

      mockedAxios.post.mockResolvedValueOnce(mockResponse);

      await expect(
        client.sendRequest(mockRequest, mockConfig)
      ).rejects.toThrow(AIProcessingError);
    });
  });

  describe('validateConnection', () => {
    it('should return true for successful OpenAI-compatible connection', async () => {
      const mockResponse = {
        data: {
          data: [
            { id: 'llama2:7b' },
            { id: 'codellama:13b' }
          ]
        }
      };

      mockedAxios.get.mockResolvedValueOnce(mockResponse);

      const result = await client.validateConnection(mockConfig);
      expect(result).toBe(true);
      expect(mockedAxios.get).toHaveBeenCalledWith(
        'http://localhost:11434/v1/models',
        expect.any(Object)
      );
    });

    it('should return true for successful Ollama connection', async () => {
      const openaiError = new Error('Not found');
      const ollamaResponse = {
        data: {
          models: [
            { name: 'llama2:7b' },
            { name: 'codellama:13b' }
          ]
        }
      };

      mockedAxios.get
        .mockRejectedValueOnce(openaiError)
        .mockResolvedValueOnce(ollamaResponse);

      const result = await client.validateConnection(mockConfig);
      expect(result).toBe(true);
      expect(mockedAxios.get).toHaveBeenCalledTimes(2);
      expect(mockedAxios.get).toHaveBeenLastCalledWith(
        'http://localhost:11434/api/tags',
        expect.any(Object)
      );
    });

    it('should return false for failed connection', async () => {
      mockedAxios.get.mockRejectedValue(new Error('Connection failed'));

      const result = await client.validateConnection(mockConfig);
      expect(result).toBe(false);
    });
  });

  describe('validateConfig', () => {
    it('should validate correct configuration', () => {
      const result = client.validateConfig(mockConfig);
      expect(result.isValid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should return errors for missing model', () => {
      const invalidConfig = { ...mockConfig, model: '' };
      const result = client.validateConfig(invalidConfig);
      
      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('Model name is required');
    });

    it('should return errors for missing base URL', () => {
      const invalidConfig = { ...mockConfig, baseUrl: undefined };
      const result = client.validateConfig(invalidConfig);
      
      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('Base URL is required for local models');
    });

    it('should validate base URL format', () => {
      const invalidConfig = { ...mockConfig, baseUrl: 'localhost:11434' };
      const result = client.validateConfig(invalidConfig);
      
      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('Base URL must start with http:// or https://');
    });

    it('should validate temperature range', () => {
      const invalidConfig = { ...mockConfig, temperature: 3.0 };
      const result = client.validateConfig(invalidConfig);
      
      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('Temperature must be between 0 and 2');
    });

    it('should validate timeout minimum', () => {
      const invalidConfig = { ...mockConfig, timeout: 1000 };
      const result = client.validateConfig(invalidConfig);
      
      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('Timeout should be at least 5000ms for local models');
    });
  });

  describe('getAvailableModels', () => {
    it('should return models from OpenAI-compatible endpoint', async () => {
      const mockResponse = {
        data: {
          data: [
            { id: 'llama2:7b' },
            { id: 'codellama:13b' },
            { id: 'mistral:7b' }
          ]
        }
      };

      mockedAxios.get.mockResolvedValueOnce(mockResponse);

      const models = await client.getAvailableModels(mockConfig);
      expect(models).toEqual(['llama2:7b', 'codellama:13b', 'mistral:7b']);
    });

    it('should return models from Ollama endpoint when OpenAI fails', async () => {
      const openaiError = new Error('Not found');
      const ollamaResponse = {
        data: {
          models: [
            { name: 'llama2:7b' },
            { name: 'codellama:13b' }
          ]
        }
      };

      mockedAxios.get
        .mockRejectedValueOnce(openaiError)
        .mockResolvedValueOnce(ollamaResponse);

      const models = await client.getAvailableModels(mockConfig);
      expect(models).toEqual(['llama2:7b', 'codellama:13b']);
    });

    it('should handle API errors', async () => {
      const apiError = {
        response: {
          status: 500,
          data: {
            error: {
              message: 'Server error'
            }
          }
        }
      };

      mockedAxios.get.mockRejectedValue(apiError);
      mockedAxios.isAxiosError.mockReturnValueOnce(true);

      await expect(
        client.getAvailableModels(mockConfig)
      ).rejects.toThrow(AIConnectionError);
    });
  });

  describe('parseResponse', () => {
    it('should parse JSON response correctly', () => {
      const jsonResponse = JSON.stringify({
        title: 'Test Report',
        summary: 'Test summary',
        sections: [
          {
            title: 'Section 1',
            content: 'Content 1',
            priority: 1
          }
        ]
      });

      const result = client.parseResponse(jsonResponse, mockRequest);

      expect(result.title).toBe('Test Report');
      expect(result.summary).toBe('Test summary');
      expect(result.sections).toHaveLength(1);
      expect(result.sections[0].title).toBe('Section 1');
      expect(result.metadata.reportType).toBe('daily');
      expect(result.metadata.aiProvider).toBe('local');
    });

    it('should handle plain text response', () => {
      const plainTextResponse = 'This is a plain text report about daily activities.';

      const result = client.parseResponse(plainTextResponse, mockRequest);

      expect(result.title).toContain('Daily Report');
      expect(result.summary).toBeDefined();
      expect(result.sections).toHaveLength(1);
      expect(result.sections[0].title).toBe('Generated Content');
    });

    it('should handle malformed JSON gracefully', () => {
      const malformedJson = '{"title": "Test", "summary":';

      const result = client.parseResponse(malformedJson, mockRequest);

      expect(result.title).toContain('Daily Report');
      expect(result.sections).toHaveLength(1);
    });

    it('should generate default title when missing', () => {
      const responseWithoutTitle = JSON.stringify({
        summary: 'Test summary',
        sections: []
      });

      const result = client.parseResponse(responseWithoutTitle, mockRequest);

      expect(result.title).toBe('Daily Report - 2024-01-01');
    });
  });
});