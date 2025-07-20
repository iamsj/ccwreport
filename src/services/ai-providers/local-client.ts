// Local AI model provider client implementation

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
  AIConnectionError,
  AIProcessingError,
  AIResponseParsingError
} from '../../models/ai';
import { ValidationResult } from '../../models/config';

/**
 * Local AI model client implementation
 * Supports OpenAI-compatible local APIs (like Ollama, LocalAI, etc.)
 */
export class LocalClient implements AIProviderClient {
  readonly provider = 'local';
  readonly name = 'Local AI Model';
  readonly version = '1.0.0';

  private client: AxiosInstance;

  constructor() {
    this.client = axios.create({
      timeout: 60000, // 60 seconds for local models (can be slower)
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
    const baseUrl = config.baseUrl || 'http://localhost:11434'; // Default Ollama port
    const timeout = options?.timeout || config.timeout || 60000;

    try {
      // Try OpenAI-compatible format first
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
        stream: false
      };

      let response;
      
      try {
        // Try OpenAI-compatible endpoint first
        response = await this.client.post(
          `${baseUrl}/v1/chat/completions`,
          payload,
          {
            headers: {
              ...(config.apiKey && { 'Authorization': `Bearer ${config.apiKey}` }),
              ...config.customHeaders
            },
            timeout
          }
        );

        // Parse OpenAI-compatible response
        const choice = response.data.choices?.[0];
        if (!choice) {
          throw new AIProcessingError(
            'No response choices returned from local model',
            this.provider,
            request
          );
        }

        return {
          content: choice.message?.content || '',
          usage: response.data.usage ? {
            promptTokens: response.data.usage.prompt_tokens || 0,
            completionTokens: response.data.usage.completion_tokens || 0,
            totalTokens: response.data.usage.total_tokens || 0
          } : undefined,
          model: response.data.model || config.model,
          finishReason: choice.finish_reason || 'stop',
          metadata: {
            responseId: response.data.id,
            created: response.data.created || Date.now()
          }
        };

      } catch (openaiError) {
        // If OpenAI format fails, try Ollama format
        const ollamaPayload = {
          model: config.model,
          prompt: this.formatPrompt(request),
          stream: false,
          options: {
            temperature: options?.temperature || config.temperature || 0.7,
            num_predict: options?.maxTokens || config.maxTokens || 2000
          }
        };

        response = await this.client.post(
          `${baseUrl}/api/generate`,
          ollamaPayload,
          {
            headers: config.customHeaders,
            timeout
          }
        );

        return {
          content: response.data.response || '',
          usage: {
            promptTokens: response.data.prompt_eval_count || 0,
            completionTokens: response.data.eval_count || 0,
            totalTokens: (response.data.prompt_eval_count || 0) + (response.data.eval_count || 0)
          },
          model: response.data.model || config.model,
          finishReason: response.data.done ? 'stop' : 'length',
          metadata: {
            totalDuration: response.data.total_duration,
            loadDuration: response.data.load_duration,
            promptEvalDuration: response.data.prompt_eval_duration,
            evalDuration: response.data.eval_duration
          }
        };
      }

    } catch (error) {
      if (axios.isAxiosError(error)) {
        throw this.handleAxiosError(error, request);
      }
      throw new AIProcessingError(
        `Local model request failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
        this.provider,
        request,
        error instanceof Error ? error : undefined
      );
    }
  }

  async validateConnection(config: AIProviderConfig): Promise<boolean> {
    try {
      const baseUrl = config.baseUrl || 'http://localhost:11434';
      
      // Try to get model info or list models
      try {
        // Try OpenAI-compatible models endpoint
        await this.client.get(`${baseUrl}/v1/models`, {
          headers: {
            ...(config.apiKey && { 'Authorization': `Bearer ${config.apiKey}` }),
            ...config.customHeaders
          },
          timeout: 10000
        });
        return true;
      } catch {
        // Try Ollama tags endpoint
        await this.client.get(`${baseUrl}/api/tags`, {
          headers: config.customHeaders,
          timeout: 10000
        });
        return true;
      }

    } catch (error) {
      return false;
    }
  }

  validateConfig(config: AIProviderConfig): ValidationResult {
    const errors: string[] = [];

    if (!config.model) {
      errors.push('Model name is required');
    }

    if (!config.baseUrl) {
      errors.push('Base URL is required for local models (e.g., http://localhost:11434)');
    }

    if (config.baseUrl && !config.baseUrl.startsWith('http')) {
      errors.push('Base URL must start with http:// or https://');
    }

    if (config.temperature !== undefined && (config.temperature < 0 || config.temperature > 2)) {
      errors.push('Temperature must be between 0 and 2');
    }

    if (config.maxTokens !== undefined && config.maxTokens < 1) {
      errors.push('Max tokens must be greater than 0');
    }

    if (config.timeout !== undefined && config.timeout < 5000) {
      errors.push('Timeout should be at least 5000ms for local models');
    }

    return {
      isValid: errors.length === 0,
      errors
    };
  }

  async getAvailableModels(config: AIProviderConfig): Promise<string[]> {
    try {
      const baseUrl = config.baseUrl || 'http://localhost:11434';
      
      try {
        // Try OpenAI-compatible models endpoint
        const response = await this.client.get(`${baseUrl}/v1/models`, {
          headers: {
            ...(config.apiKey && { 'Authorization': `Bearer ${config.apiKey}` }),
            ...config.customHeaders
          },
          timeout: 10000
        });

        return response.data.data?.map((model: any) => model.id) || [];

      } catch {
        // Try Ollama tags endpoint
        const response = await this.client.get(`${baseUrl}/api/tags`, {
          headers: config.customHeaders,
          timeout: 10000
        });

        return response.data.models?.map((model: any) => model.name) || [];
      }

    } catch (error) {
      if (axios.isAxiosError(error)) {
        throw this.handleAxiosError(error);
      }
      throw new AIConnectionError(
        `Failed to fetch local models: ${error instanceof Error ? error.message : 'Unknown error'}`,
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
        `Failed to parse local model response: ${error instanceof Error ? error.message : 'Unknown error'}`,
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
          `Local model authentication failed: ${message}`,
          this.provider,
          error
        );
      case 500:
      case 502:
      case 503:
      case 504:
        return new AIConnectionError(
          `Local model server error: ${message}`,
          this.provider,
          error
        );
      default:
        if (error.code === 'ECONNREFUSED') {
          return new AIConnectionError(
            'Cannot connect to local model server. Make sure it is running.',
            this.provider,
            error
          );
        }
        return new AIProcessingError(
          `Local model error: ${message}`,
          this.provider,
          request,
          error
        );
    }
  }
}