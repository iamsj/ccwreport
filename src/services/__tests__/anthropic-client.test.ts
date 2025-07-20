// Anthropic client unit tests

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import axios from 'axios';
import { AnthropicClient } from '../ai-providers/anthropic-client';
import {
  AIProcessingRequest,
  AIProviderConfig,
  AIAuthenticationError,
  AIRateLimitError,
  AIProcessingError
} from '../../models/ai';

// Mock axios
vi.mock('axios');
const mockedAxios = vi.mocked(axios);

describe('AnthropicClient', () => {
  let client: AnthropicClient;
  let mockConfig: AIProviderConfig;
  let mockRequest: AIProcessingRequest;

  beforeEach(() => {
    client = new AnthropicClient();
    
    mockConfig = {
      provider: 'anthropic',
      model: 'claude-3-sonnet-20240229',
      apiKey: 'test-api-key',
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
    it('should successfully send request and parse response', async () => {
      const mockResponse = {
        data: {
          content: [
            {
              type: 'text',
              text: '{"title":"Daily Report","summary":"Test summary","sections":[{"title":"Overview","content":"Test content","priority":1}]}'
            }
          ],
          usage: {
            input_tokens: 100,
            output_tokens: 200
          },
          model: 'claude-3-sonnet-20240229',
          id: 'msg_123',
          stop_reason: 'end_turn'
        },
        headers: {
          'request-id': 'req-123'
        }
      };

      mockedAxios.post.mockResolvedValueOnce(mockResponse);

      const result = await client.sendRequest(mockRequest, mockConfig);

      expect(result.content).toContain('Daily Report');
      expect(result.usage?.promptTokens).toBe(100);
      expect(result.usage?.completionTokens).toBe(200);
      expect(result.usage?.totalTokens).toBe(300);
      expect(result.model).toBe('claude-3-sonnet-20240229');
      expect(result.finishReason).toBe('end_turn');
      expect(mockedAxios.post).toHaveBeenCalledWith(
        'https://api.anthropic.com/v1/messages',
        expect.objectContaining({
          model: 'claude-3-sonnet-20240229',
          temperature: 0.7,
          max_tokens: 1000
        }),
        expect.objectContaining({
          headers: expect.objectContaining({
            'x-api-key': 'test-api-key',
            'anthropic-version': '2023-06-01'
          })
        })
      );
    });

    it('should use custom base URL when provided', async () => {
      const customConfig = {
        ...mockConfig,
        baseUrl: 'https://custom-anthropic.example.com/v1'
      };

      const mockResponse = {
        data: {
          content: [{ type: 'text', text: 'test response' }],
          model: 'claude-3-sonnet-20240229',
          stop_reason: 'end_turn'
        }
      };

      mockedAxios.post.mockResolvedValueOnce(mockResponse);

      await client.sendRequest(mockRequest, customConfig);

      expect(mockedAxios.post).toHaveBeenCalledWith(
        'https://custom-anthropic.example.com/v1/messages',
        expect.any(Object),
        expect.any(Object)
      );
    });

    it('should handle authentication errors', async () => {
      const authError = {
        response: {
          status: 401,
          data: {
            error: {
              message: 'Invalid API key'
            }
          }
        }
      };

      mockedAxios.post.mockRejectedValueOnce(authError);
      mockedAxios.isAxiosError.mockReturnValueOnce(true);

      await expect(
        client.sendRequest(mockRequest, mockConfig)
      ).rejects.toThrow(AIAuthenticationError);
    });

    it('should handle rate limit errors', async () => {
      const rateLimitError = {
        response: {
          status: 429,
          data: {
            error: {
              message: 'Rate limit exceeded'
            }
          },
          headers: {
            'retry-after': '60'
          }
        }
      };

      mockedAxios.post.mockRejectedValueOnce(rateLimitError);
      mockedAxios.isAxiosError.mockReturnValueOnce(true);

      await expect(
        client.sendRequest(mockRequest, mockConfig)
      ).rejects.toThrow(AIRateLimitError);
    });

    it('should handle invalid response format', async () => {
      const mockResponse = {
        data: {
          content: [
            {
              type: 'image',
              source: 'base64data'
            }
          ],
          model: 'claude-3-sonnet-20240229'
        }
      };

      mockedAxios.post.mockResolvedValueOnce(mockResponse);

      await expect(
        client.sendRequest(mockRequest, mockConfig)
      ).rejects.toThrow(AIProcessingError);
    });

    it('should handle missing content', async () => {
      const mockResponse = {
        data: {
          content: [],
          model: 'claude-3-sonnet-20240229'
        }
      };

      mockedAxios.post.mockResolvedValueOnce(mockResponse);

      await expect(
        client.sendRequest(mockRequest, mockConfig)
      ).rejects.toThrow(AIProcessingError);
    });
  });

  describe('validateConnection', () => {
    it('should return true for successful connection', async () => {
      const mockResponse = {
        data: {
          content: [{ type: 'text', text: 'Hello!' }],
          model: 'claude-3-sonnet-20240229'
        }
      };

      mockedAxios.post.mockResolvedValueOnce(mockResponse);

      const result = await client.validateConnection(mockConfig);
      expect(result).toBe(true);
      expect(mockedAxios.post).toHaveBeenCalledWith(
        'https://api.anthropic.com/v1/messages',
        expect.objectContaining({
          model: 'claude-3-sonnet-20240229',
          max_tokens: 10,
          messages: [{ role: 'user', content: 'Hello' }]
        }),
        expect.objectContaining({
          headers: expect.objectContaining({
            'x-api-key': 'test-api-key'
          })
        })
      );
    });

    it('should return false for failed connection', async () => {
      mockedAxios.post.mockRejectedValueOnce(new Error('Network error'));

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

    it('should return errors for missing API key', () => {
      const invalidConfig = { ...mockConfig, apiKey: undefined };
      const result = client.validateConfig(invalidConfig);
      
      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('Anthropic API key is required');
    });

    it('should return errors for missing model', () => {
      const invalidConfig = { ...mockConfig, model: '' };
      const result = client.validateConfig(invalidConfig);
      
      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('Model name is required');
    });

    it('should validate model name format', () => {
      const invalidConfig = { ...mockConfig, model: 'gpt-3.5-turbo' };
      const result = client.validateConfig(invalidConfig);
      
      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('Anthropic model name should start with "claude-"');
    });

    it('should validate temperature range', () => {
      const invalidConfig = { ...mockConfig, temperature: 1.5 };
      const result = client.validateConfig(invalidConfig);
      
      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('Temperature must be between 0 and 1 for Anthropic');
    });

    it('should validate max tokens limit', () => {
      const invalidConfig = { ...mockConfig, maxTokens: 5000 };
      const result = client.validateConfig(invalidConfig);
      
      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('Max tokens cannot exceed 4096 for most Claude models');
    });
  });

  describe('getAvailableModels', () => {
    it('should return known Claude models', async () => {
      const models = await client.getAvailableModels(mockConfig);
      
      expect(models).toContain('claude-3-opus-20240229');
      expect(models).toContain('claude-3-sonnet-20240229');
      expect(models).toContain('claude-3-haiku-20240307');
      expect(models).toContain('claude-2.1');
      expect(models).toContain('claude-2.0');
      expect(models).toContain('claude-instant-1.2');
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
      expect(result.metadata.aiProvider).toBe('anthropic');
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