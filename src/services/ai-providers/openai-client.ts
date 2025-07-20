// OpenAI provider client implementation

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
 * OpenAI API client implementation
 */
export class OpenAIClient implements AIProviderClient {
  readonly provider = 'openai';
  readonly name = 'OpenAI';
  readonly version = '1.0.0';

  private client: AxiosInstance;

  constructor() {
    this.client = axios.create({
      timeout: 30000, // 30 seconds default timeout
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': 'git-report-generator/1.0.0'
      }
    });
  }

  async sendRequest(
    request: AIProcessingRequest,
    config: AIProviderConfig,
    options?: AIProcessingOptions
  ): Promise<AIProcessingResponse> {
    const baseUrl = config.baseUrl || 'https://api.openai.com/v1';
    const timeout = options?.timeout || config.timeout || 30000;

    try {
      // Prepare the request payload
      const payload = {
        model: config.model,
        messages: [
          {
            role: 'system',
            content: 'You are a helpful assistant that generates professional reports from git commit data.'
          },
          {
            role: 'user',
            content: this.formatPrompt(request)
          }
        ],
        temperature: options?.temperature || config.temperature || 0.7,
        max_tokens: options?.maxTokens || config.maxTokens || 2000,
        stream: false // We'll implement streaming later if needed
      };

      // Make the API request
      const response = await this.client.post(
        `${baseUrl}/chat/completions`,
        payload,
        {
          headers: {
            'Authorization': `Bearer ${config.apiKey}`,
            ...config.customHeaders
          },
          timeout
        }
      );

      // Parse the response
      const choice = response.data.choices?.[0];
      if (!choice) {
        throw new AIProcessingError(
          'No response choices returned from OpenAI',
          this.provider,
          request
        );
      }

      return {
        content: choice.message?.content || '',
        usage: response.data.usage ? {
          promptTokens: response.data.usage.prompt_tokens,
          completionTokens: response.data.usage.completion_tokens,
          totalTokens: response.data.usage.total_tokens
        } : undefined,
        model: response.data.model,
        finishReason: choice.finish_reason,
        metadata: {
          requestId: response.headers['x-request-id'],
          responseId: response.data.id,
          created: response.data.created
        }
      };

    } catch (error) {
      if (axios.isAxiosError(error)) {
        throw this.handleAxiosError(error, request);
      }
      throw new AIProcessingError(
        `OpenAI request failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
        this.provider,
        request,
        error instanceof Error ? error : undefined
      );
    }
  }

  async validateConnection(config: AIProviderConfig): Promise<boolean> {
    try {
      const baseUrl = config.baseUrl || 'https://api.openai.com/v1';
      
      // Test with a simple models list request
      await this.client.get(`${baseUrl}/models`, {
        headers: {
          'Authorization': `Bearer ${config.apiKey}`,
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
      errors.push('OpenAI API key is required');
    }

    if (!config.model) {
      errors.push('Model name is required');
    }

    if (config.temperature !== undefined && (config.temperature < 0 || config.temperature > 2)) {
      errors.push('Temperature must be between 0 and 2');
    }

    if (config.maxTokens !== undefined && config.maxTokens < 1) {
      errors.push('Max tokens must be greater than 0');
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
    try {
      const baseUrl = config.baseUrl || 'https://api.openai.com/v1';
      
      const response = await this.client.get(`${baseUrl}/models`, {
        headers: {
          'Authorization': `Bearer ${config.apiKey}`,
          ...config.customHeaders
        },
        timeout: 10000
      });

      return response.data.data
        .filter((model: any) => model.id.includes('gpt'))
        .map((model: any) => model.id)
        .sort();

    } catch (error) {
      if (axios.isAxiosError(error)) {
        throw this.handleAxiosError(error);
      }
      throw new AIConnectionError(
        `Failed to fetch OpenAI models: ${error instanceof Error ? error.message : 'Unknown error'}`,
        this.provider,
        error instanceof Error ? error : undefined
      );
    }
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
        `Failed to parse OpenAI response: ${error instanceof Error ? error.message : 'Unknown error'}`,
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
    let title = this.generateDefaultTitle(request);
    
    // Look for a title in the first few lines
    for (let i = 0; i < Math.min(3, lines.length); i++) {
      const line = lines[i];
      if (line.startsWith('#')) {
        title = line.replace(/^#+\s*/, '');
        break;
      } else if (line.length < 100 && line.length > 10) {
        title = line;
        break;
      }
    }

    // Extract summary (usually the first paragraph)
    const summaryMatch = response.match(/(?:summary|overview|executive summary)[:\s]*([^\.]+(?:\.[^\.]*){0,2})/i);
    const summary = summaryMatch ? summaryMatch[1].trim() : lines.slice(0, 2).join(' ').substring(0, 200) + '...';

    // Create basic sections from the content
    const sections = [
      {
        title: 'Generated Content',
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
          `OpenAI authentication failed: ${message}`,
          this.provider,
          error
        );
      case 429:
        const retryAfter = error.response?.headers['retry-after'];
        return new AIRateLimitError(
          `OpenAI rate limit exceeded: ${message}`,
          this.provider,
          retryAfter ? parseInt(retryAfter) : undefined,
          error
        );
      case 402:
        return new AIQuotaExceededError(
          `OpenAI quota exceeded: ${message}`,
          this.provider,
          error
        );
      case 500:
      case 502:
      case 503:
      case 504:
        return new AIConnectionError(
          `OpenAI server error: ${message}`,
          this.provider,
          error
        );
      default:
        return new AIProcessingError(
          `OpenAI API error: ${message}`,
          this.provider,
          request,
          error
        );
    }
  }
}