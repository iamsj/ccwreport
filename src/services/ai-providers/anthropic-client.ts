// Anthropic provider client implementation

import axios, { AxiosInstance, AxiosError } from 'axios';
import {
  AIProviderClient,
  AIProcessingRequest,
  AIProcessingResponse,
  AIProviderConfig,
  AIProcessingOptions,
  ProcessedReport,
  AIError,
  AIAuthenticationError,
  AIRateLimitError,
  AIQuotaExceededError,
  AIConnectionError,
  AIProcessingError,
  AIResponseParsingError
} from '../../models/ai';
import { ValidationResult } from '../../models/config';

/**
 * Anthropic Claude API client implementation
 */
export class AnthropicClient implements AIProviderClient {
  readonly provider = 'anthropic';
  readonly name = 'Anthropic Claude';
  readonly version = '1.0.0';

  private client: AxiosInstance;

  constructor() {
    this.client = axios.create({
      timeout: 30000, // 30 seconds default timeout
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': 'git-report-generator/1.0.0',
        'anthropic-version': '2023-06-01'
      }
    });
  }

  async sendRequest(
    request: AIProcessingRequest,
    config: AIProviderConfig,
    options?: AIProcessingOptions
  ): Promise<AIProcessingResponse> {
    const baseUrl = config.baseUrl || 'https://api.anthropic.com/v1';
    const timeout = options?.timeout || config.timeout || 30000;

    try {
      // Prepare the request payload for Claude
      const payload = {
        model: config.model,
        max_tokens: options?.maxTokens || config.maxTokens || 2000,
        temperature: options?.temperature || config.temperature || 0.7,
        messages: [
          {
            role: 'user',
            content: this.formatPrompt(request)
          }
        ],
        system: 'You are a helpful assistant that generates professional reports from git commit data. Always respond with well-structured, professional content.'
      };

      // Make the API request
      const response = await this.client.post(
        `${baseUrl}/messages`,
        payload,
        {
          headers: {
            'x-api-key': config.apiKey,
            ...config.customHeaders
          },
          timeout
        }
      );

      // Parse the response
      const content = response.data.content?.[0];
      if (!content || content.type !== 'text') {
        throw new AIProcessingError(
          'Invalid response format from Anthropic',
          this.provider,
          request
        );
      }

      return {
        content: content.text || '',
        usage: response.data.usage ? {
          promptTokens: response.data.usage.input_tokens,
          completionTokens: response.data.usage.output_tokens,
          totalTokens: response.data.usage.input_tokens + response.data.usage.output_tokens
        } : undefined,
        model: response.data.model,
        finishReason: response.data.stop_reason || 'stop',
        metadata: {
          requestId: response.headers['request-id'],
          responseId: response.data.id,
          created: new Date().toISOString()
        }
      };

    } catch (error) {
      if (axios.isAxiosError(error)) {
        throw this.handleAxiosError(error, request);
      }
      throw new AIProcessingError(
        `Anthropic request failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
        this.provider,
        request,
        error instanceof Error ? error : undefined
      );
    }
  }

  async validateConnection(config: AIProviderConfig): Promise<boolean> {
    try {
      // Test with a simple message request
      const testPayload = {
        model: config.model,
        max_tokens: 10,
        messages: [
          {
            role: 'user',
            content: 'Hello'
          }
        ]
      };

      const baseUrl = config.baseUrl || 'https://api.anthropic.com/v1';
      
      await this.client.post(`${baseUrl}/messages`, testPayload, {
        headers: {
          'x-api-key': config.apiKey,
          ...config.customHeaders
        },
        timeout: 10000
      });

      return true;
    } catch (error) {
      return false;
    }
  }

  validateConfig(config: AIProviderConfig): ValidationResult {
    const errors: string[] = [];

    if (!config.apiKey) {
      errors.push('Anthropic API key is required');
    }

    if (!config.model) {
      errors.push('Model name is required');
    }

    // Validate model name format for Claude
    if (config.model && !config.model.startsWith('claude-')) {
      errors.push('Anthropic model name should start with "claude-"');
    }

    if (config.temperature !== undefined && (config.temperature < 0 || config.temperature > 1)) {
      errors.push('Temperature must be between 0 and 1 for Anthropic');
    }

    if (config.maxTokens !== undefined && config.maxTokens < 1) {
      errors.push('Max tokens must be greater than 0');
    }

    if (config.maxTokens !== undefined && config.maxTokens > 4096) {
      errors.push('Max tokens cannot exceed 4096 for most Claude models');
    }

    if (config.timeout !== undefined && config.timeout < 1000) {
      errors.push('Timeout must be at least 1000ms');
    }

    return {
      isValid: errors.length === 0,
      errors
    };
  }

  async getAvailableModels(config: AIProviderConfig): Promise<string[]> {
    // Anthropic doesn't have a models endpoint, so we return known models
    return [
      'claude-3-opus-20240229',
      'claude-3-sonnet-20240229',
      'claude-3-haiku-20240307',
      'claude-2.1',
      'claude-2.0',
      'claude-instant-1.2'
    ];
  }

  parseResponse(rawResponse: string, request: AIProcessingRequest): ProcessedReport {
    try {
      // Try to parse as JSON first (structured response)
      let parsedContent;
      try {
        parsedContent = JSON.parse(rawResponse);
      } catch {
        // If not JSON, treat as plain text and structure it
        parsedContent = this.structurePlainTextResponse(rawResponse, request);
      }

      // Ensure we have the required structure
      const report: ProcessedReport = {
        title: parsedContent.title || this.generateDefaultTitle(request),
        summary: parsedContent.summary || this.extractSummary(rawResponse),
        sections: parsedContent.sections || this.extractSections(rawResponse),
        metadata: {
          generatedAt: new Date(),
          reportType: request.reportType,
          timeRange: request.timeRange,
          dataSourcesUsed: request.data.map(d => d.source),
          aiProvider: this.provider,
          model: '', // Will be filled by the processor
          processingTime: 0 // Will be calculated by the processor
        }
      };

      return report;

    } catch (error) {
      throw new AIResponseParsingError(
        `Failed to parse Anthropic response: ${error instanceof Error ? error.message : 'Unknown error'}`,
        this.provider,
        rawResponse,
        error instanceof Error ? error : undefined
      );
    }
  }

  private formatPrompt(request: AIProcessingRequest): string {
    const { data, prompt, reportType, timeRange } = request;
    
    // Format the git commit data
    const formattedData = data.map(source => {
      const commits = source.data.map(commit => 
        `- ${commit.date.toISOString().split('T')[0]} | ${commit.author} | ${commit.message.split('\n')[0]}`
      ).join('\n');
      
      return `Source: ${source.source}\nCommits:\n${commits}`;
    }).join('\n\n');

    return `${prompt}

Report Type: ${reportType}
Time Range: ${timeRange.start.toISOString().split('T')[0]} to ${timeRange.end.toISOString().split('T')[0]}

Data:
${formattedData}

Please generate a well-structured report with:
1. A clear title
2. An executive summary
3. Detailed sections covering the key activities and achievements
4. Use professional language appropriate for stakeholders

Format the response as JSON with the following structure:
{
  "title": "Report Title",
  "summary": "Executive summary...",
  "sections": [
    {
      "title": "Section Title",
      "content": "Section content...",
      "priority": 1
    }
  ]
}`;
  }

  private structurePlainTextResponse(response: string, request: AIProcessingRequest): any {
    // Extract title (usually the first line or a line starting with #)
    const lines = response.split('\n').filter(line => line.trim());
    const titleMatch = lines.find(line => line.startsWith('#') || line.length < 100);
    const title = titleMatch ? titleMatch.replace(/^#+\s*/, '') : this.generateDefaultTitle(request);

    // Extract summary (usually the first paragraph)
    const summaryMatch = response.match(/(?:summary|overview|executive summary)[:\s]*([^\.]+(?:\.[^\.]*){0,2})/i);
    const summary = summaryMatch ? summaryMatch[1].trim() : lines.slice(0, 3).join(' ').substring(0, 200) + '...';

    // Create basic sections from the content
    const sections = [
      {
        title: 'Overview',
        content: response.substring(0, Math.min(500, response.length)),
        priority: 1
      }
    ];

    return { title, summary, sections };
  }

  private generateDefaultTitle(request: AIProcessingRequest): string {
    const { reportType, timeRange } = request;
    const dateStr = timeRange.start.toISOString().split('T')[0];
    return `${reportType.charAt(0).toUpperCase() + reportType.slice(1)} Report - ${dateStr}`;
  }

  private extractSummary(content: string): string {
    const lines = content.split('\n').filter(line => line.trim());
    return lines.slice(0, 2).join(' ').substring(0, 200) + '...';
  }

  private extractSections(content: string): any[] {
    return [
      {
        title: 'Generated Content',
        content: content,
        priority: 1
      }
    ];
  }

  private handleAxiosError(error: AxiosError, request?: AIProcessingRequest): AIError {
    const status = error.response?.status;
    const message = error.response?.data?.error?.message || error.message;

    switch (status) {
      case 401:
        return new AIAuthenticationError(
          `Anthropic authentication failed: ${message}`,
          this.provider,
          error
        );
      case 429:
        const retryAfter = error.response?.headers['retry-after'];
        return new AIRateLimitError(
          `Anthropic rate limit exceeded: ${message}`,
          this.provider,
          retryAfter ? parseInt(retryAfter) : undefined,
          error
        );
      case 402:
        return new AIQuotaExceededError(
          `Anthropic quota exceeded: ${message}`,
          this.provider,
          error
        );
      case 500:
      case 502:
      case 503:
      case 504:
        return new AIConnectionError(
          `Anthropic server error: ${message}`,
          this.provider,
          error
        );
      default:
        return new AIProcessingError(
          `Anthropic API error: ${message}`,
          this.provider,
          request,
          error
        );
    }
  }
}