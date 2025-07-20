// AI provider factory and setup utilities

import {
  DefaultAIProcessor,
  SimpleAIProviderRegistry,
  AIProcessor
} from './ai-processor';
import { OpenAIClient } from './ai-providers/openai-client';
import { AnthropicClient } from './ai-providers/anthropic-client';
import { LocalClient } from './ai-providers/local-client';

/**
 * Create and configure an AI processor with all supported providers
 */
export function createAIProcessor(): AIProcessor {
  const registry = new SimpleAIProviderRegistry();
  
  // Register all supported AI providers
  registry.register(new OpenAIClient());
  registry.register(new AnthropicClient());
  registry.register(new LocalClient());
  
  return new DefaultAIProcessor(registry);
}

/**
 * Create an AI processor with only specific providers
 */
export function createCustomAIProcessor(providers: string[]): AIProcessor {
  const registry = new SimpleAIProviderRegistry();
  
  // Register only requested providers
  if (providers.includes('openai')) {
    registry.register(new OpenAIClient());
  }
  
  if (providers.includes('anthropic')) {
    registry.register(new AnthropicClient());
  }
  
  if (providers.includes('local')) {
    registry.register(new LocalClient());
  }
  
  return new DefaultAIProcessor(registry);
}

/**
 * Get default AI configuration for testing
 */
export function getDefaultAIConfigs() {
  return {
    openai: {
      provider: 'openai' as const,
      model: 'gpt-3.5-turbo',
      apiKey: process.env.OPENAI_API_KEY || 'test-key',
      temperature: 0.7,
      maxTokens: 1000
    },
    anthropic: {
      provider: 'anthropic' as const,
      model: 'claude-3-sonnet-20240229',
      apiKey: process.env.ANTHROPIC_API_KEY || 'test-key',
      temperature: 0.7,
      maxTokens: 1000
    },
    local: {
      provider: 'local' as const,
      model: 'llama2:7b',
      baseUrl: 'http://localhost:11434',
      temperature: 0.7,
      maxTokens: 1000
    }
  };
}