// OpenAI client unit tests

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import axios from 'axios';
import { OpenAIClient } from '../ai-providers/openai-client';
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

describe('OpenAIClient', () => {
  let client: OpenAIClient;
  let mockConfig: AIProviderConfig;
  let mockRequest: AIProcessingRequest;

  beforeEach(() => {
    // Reset axios mock
    vi.clearAllMocks();
    
    // Mock axios.create to return a mock instance with the methods we need
    const mockAxiosInstance = {
      post: vi.fn(),
      get: vi.fn(),
      defaults: {},
      interceptors: {
        request: { use: vi.fn(), eject: vi.fn() },
        response: { use: vi.fn(), eject: vi.fn() }
      }
    };
    
    mockedAxios.create.mockReturnValue(mockAxiosInstance as any);
    mockedAxios.post = mockAxiosInstance.post;
    mockedAxios.get = mockAxiosInstance.get;
    
    client = new OpenAIClient();
    
    mockConfig = {
      provider: 'openai',
      model: 'gpt-3.5-turbo',
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
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('sendRequest', () => {
    it('should successfully send request and parse response', async () => {
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
          model: 'gpt-3.5-turbo',
          id: 'chatcmpl-123'
        },
        headers: {
          'x-request-id': 'req-123'
        }
      };

      mockedAxios.post.mockResolvedValueOnce(mockResponse);

      const result = await client.sendRequest(mockRequest, mockConfig);

      expect(result.content).toContain('Daily Report');
      expect(result.usage?.totalTokens).toBe(300);
      expect(result.model).toBe('gpt-3.5-turbo');
      expect(result.finishReason).toBe('stop');
      expect(mockedAxios.post).toHaveBeenCalledWith(
        'https://api.openai.com/v1/chat/completions',
        expect.objectContaining({
          model: 'gpt-3.5-turbo',
          temperature: 0.7,
          max_tokens: 1000
        }),
        expect.objectContaining({
          headers: expect.objectContaining({
            'Authorization': 'Bearer test-api-key'
          })
        })
      );
    });

    it('should use custom base URL when provided', async () => {
      const customConfig = {
        ...mockConfig,
        baseUrl: 'https://custom-api.example.com/v1'
      };

      const mockResponse = {
        data: {
          choices: [{ message: { content: 'test response' }, finish_reason: 'stop' }],
          model: 'gpt-3.5-turbo'
        }
      };

      mockedAxios.post.mockResolvedValueOnce(mockResponse);

      await client.sendRequest(mockRequest, customConfig);

      expect(mockedAxios.post).toHaveBeenCalledWith(
        'https://custom-api.example.com/v1/chat/completions',
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

    it('should handle missing response choices', async () => {
      const mockResponse = {
        data: {
          choices: [],
          model: 'gpt-3.5-turbo'
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
          data: [
            { id: 'gpt-3.5-turbo' },
            { id: 'gpt-4' }
          ]
        }
      };

      mockedAxios.get.mockResolvedValueOnce(mockResponse);

      const result = await client.validateConnection(mockConfig);
      expect(result).toBe(true);
      expect(mockedAxios.get).toHaveBeenCalledWith(
        'https://api.openai.com/v1/models',
        expect.objectContaining({
          headers: expect.objectContaining({
            'Authorization': 'Bearer test-api-key'
          })
        })
      );
    });

    it('should return false for failed connection', async () => {
      mockedAxios.get.mockRejectedValueOnce(new Error('Network error'));

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
      expect(result.errors).toContain('OpenAI API key is required');
    });

    it('should return errors for missing model', () => {
      const invalidConfig = { ...mockConfig, model: '' };
      const result = client.validateConfig(invalidConfig);
      
      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('Model name is required');
    });

    it('should validate temperature range', () => {
      const invalidConfig = { ...mockConfig, temperature: 3.0 };
      const result = client.validateConfig(invalidConfig);
      
      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('Temperature must be between 0 and 2');
    });

    it('should validate max tokens', () => {
      const invalidConfig = { ...mockConfig, maxTokens: 0 };
      const result = client.validateConfig(invalidConfig);
      
      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('Max tokens must be greater than 0');
    });
  });

  describe('getAvailableModels', () => {
    it('should return filtered GPT models', async () => {
      const mockResponse = {
        data: {
          data: [
            { id: 'gpt-3.5-turbo' },
            { id: 'gpt-4' },
            { id: 'text-davinci-003' },
            { id: 'whisper-1' }
          ]
        }
      };

      mockedAxios.get.mockResolvedValueOnce(mockResponse);

      const models = await client.getAvailableModels(mockConfig);
      expect(models).toEqual(['gpt-3.5-turbo', 'gpt-4']);
    });

    it('should handle API errors', async () => {
      const apiError = {
        response: {
          status: 401,
          data: {
            error: {
              message: 'Invalid API key'
            }
          }
        }
      };

      mockedAxios.get.mockRejectedValueOnce(apiError);
      mockedAxios.isAxiosError.mockReturnValueOnce(true);

      await expect(
        client.getAvailableModels(mockConfig)
      ).rejects.toThrow('OpenAI authentication failed');
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
  });
});