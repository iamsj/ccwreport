// Unit tests for configuration validation
import { describe, it, expect } from 'vitest';
import { ConfigurationValidator } from '../validation';
import {
  SystemConfig,
  GitDataSourceConfig,
  AIConfiguration,
  OutputConfiguration,
  ReportTypeConfig
} from '../config';

describe('ConfigurationValidator', () => {
  describe('applyDefaults', () => {
    it('should apply defaults to an empty configuration', () => {
      const emptyConfig = {};
      const defaultedConfig = ConfigurationValidator.applyDefaults(emptyConfig);
      
      expect(defaultedConfig.version).toBe(ConfigurationValidator.DEFAULT_VERSION);
      expect(defaultedConfig.lastUpdated).toBeInstanceOf(Date);
      expect(defaultedConfig.dataSources).toHaveLength(1);
      expect(defaultedConfig.dataSources[0].type).toBe('git');
      expect(defaultedConfig.aiConfig.provider).toBe(ConfigurationValidator.DEFAULT_PROVIDER);
      expect(defaultedConfig.aiConfig.model).toBe(ConfigurationValidator.DEFAULT_MODEL);
      expect(defaultedConfig.outputConfig.format).toBe(ConfigurationValidator.DEFAULT_FORMAT);
      expect(defaultedConfig.reportTypes).toHaveLength(3);
    });

    it('should preserve existing values when applying defaults', () => {
      const partialConfig = {
        version: '2.0.0',
        aiConfig: {
          provider: 'anthropic',
          model: 'claude-2'
        },
        reportTypes: [
          { type: 'daily', enabled: false }
        ]
      };
      
      const defaultedConfig = ConfigurationValidator.applyDefaults(partialConfig);
      
      expect(defaultedConfig.version).toBe('2.0.0'); // Preserved
      expect(defaultedConfig.lastUpdated).toBeInstanceOf(Date); // Default
      expect(defaultedConfig.dataSources).toHaveLength(1); // Default
      expect(defaultedConfig.aiConfig.provider).toBe('anthropic'); // Preserved
      expect(defaultedConfig.aiConfig.model).toBe('claude-2'); // Preserved
      expect(defaultedConfig.outputConfig.format).toBe(ConfigurationValidator.DEFAULT_FORMAT); // Default
      expect(defaultedConfig.reportTypes).toHaveLength(1); // Preserved
      expect(defaultedConfig.reportTypes[0].enabled).toBe(false); // Preserved
    });

    it('should handle nested partial configurations', () => {
      const partialConfig = {
        aiConfig: {
          provider: 'openai',
          // Missing model and other fields
        },
        outputConfig: {
          // Only format specified
          format: 'html'
        }
      };
      
      const defaultedConfig = ConfigurationValidator.applyDefaults(partialConfig);
      
      expect(defaultedConfig.aiConfig.provider).toBe('openai'); // Preserved
      expect(defaultedConfig.aiConfig.model).toBe(ConfigurationValidator.DEFAULT_MODEL); // Default
      expect(defaultedConfig.aiConfig.timeout).toBe(ConfigurationValidator.DEFAULT_TIMEOUT); // Default
      expect(defaultedConfig.outputConfig.format).toBe('html'); // Preserved
      expect(defaultedConfig.outputConfig.outputPath).toBe(ConfigurationValidator.DEFAULT_OUTPUT_PATH); // Default
    });
  });

  describe('validateSystemConfig', () => {
    it('should validate a complete valid system configuration', () => {
      const validConfig: SystemConfig = {
        version: '1.0.0',
        lastUpdated: new Date(),
        dataSources: [{
          type: 'git',
          enabled: true,
          name: 'test-repo',
          repositories: [{
            name: 'test',
            path: '/path/to/repo'
          }]
        } as GitDataSourceConfig],
        aiConfig: {
          provider: 'openai',
          apiKey: 'test-key',
          model: 'gpt-4',
          customPrompts: {
            daily: 'Daily prompt',
            weekly: 'Weekly prompt',
            monthly: 'Monthly prompt'
          }
        },
        outputConfig: {
          format: 'markdown',
          outputPath: './reports',
          includeMetadata: true
        },
        reportTypes: [{
          type: 'daily',
          enabled: true
        }]
      };

      const result = ConfigurationValidator.validateSystemConfig(validConfig);
      expect(result.isValid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should fail validation for missing required fields', () => {
      const invalidConfig = {
        dataSources: [],
        aiConfig: {} as AIConfiguration,
        outputConfig: {} as OutputConfiguration,
        reportTypes: []
      } as SystemConfig;

      const result = ConfigurationValidator.validateSystemConfig(invalidConfig);
      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('System configuration must include a version');
      expect(result.errors).toContain('System configuration must include lastUpdated timestamp');
      expect(result.errors).toContain('At least one data source must be configured');
    });
  });

  describe('validateGitDataSource', () => {
    it('should validate a valid git data source configuration', () => {
      const validGitConfig: GitDataSourceConfig = {
        type: 'git',
        enabled: true,
        name: 'test-git',
        repositories: [{
          name: 'test-repo',
          path: '/path/to/repo',
          branch: 'main'
        }]
      };

      const result = ConfigurationValidator.validateGitDataSource(validGitConfig);
      expect(result.isValid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should fail validation for missing repositories', () => {
      const invalidGitConfig: GitDataSourceConfig = {
        type: 'git',
        enabled: true,
        name: 'test-git',
        repositories: []
      };

      const result = ConfigurationValidator.validateGitDataSource(invalidGitConfig);
      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('Git data source must have at least one repository configured. Add a repository with name and path properties');
    });

    it('should fail validation for repository missing required fields', () => {
      const invalidGitConfig: GitDataSourceConfig = {
        type: 'git',
        enabled: true,
        name: 'test-git',
        repositories: [{
          name: '',
          path: ''
        }]
      };

      const result = ConfigurationValidator.validateGitDataSource(invalidGitConfig);
      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('Repository 0: name is required. Provide a descriptive name for this repository');
      expect(result.errors).toContain('Repository 0: path is required. Provide the local path to the git repository (e.g., "." for current directory or "/path/to/repo")');
    });

    it('should warn about remote repository without credentials', () => {
      const gitConfigWithRemote: GitDataSourceConfig = {
        type: 'git',
        enabled: true,
        name: 'test-git',
        repositories: [{
          name: 'test-repo',
          path: '/path/to/repo',
          remote: 'https://github.com/user/repo.git'
        }]
      };

      const result = ConfigurationValidator.validateGitDataSource(gitConfigWithRemote);
      expect(result.isValid).toBe(true);
      expect(result.warnings).toContain('Repository 0: remote repository "https://github.com/user/repo.git" specified but no credentials provided. This may cause authentication issues for private repositories');
    });
  });

  describe('validateAIConfiguration', () => {
    it('should validate a valid OpenAI configuration', () => {
      const validAIConfig: AIConfiguration = {
        provider: 'openai',
        apiKey: 'sk-test-key',
        model: 'gpt-4',
        customPrompts: {
          daily: 'Daily prompt',
          weekly: 'Weekly prompt',
          monthly: 'Monthly prompt'
        }
      };

      const result = ConfigurationValidator.validateAIConfiguration(validAIConfig);
      expect(result.isValid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should fail validation for missing API key with external provider', () => {
      const invalidAIConfig: AIConfiguration = {
        provider: 'openai',
        model: 'gpt-4',
        customPrompts: {
          daily: 'Daily prompt',
          weekly: 'Weekly prompt',
          monthly: 'Monthly prompt'
        }
      };

      const result = ConfigurationValidator.validateAIConfiguration(invalidAIConfig);
      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('API key is required for openai provider. Please obtain an API key from https://platform.openai.com/api-keys');
    });

    it('should fail validation for invalid provider', () => {
      const invalidAIConfig = {
        provider: 'invalid-provider',
        model: 'test-model',
        customPrompts: {}
      } as AIConfiguration;

      const result = ConfigurationValidator.validateAIConfiguration(invalidAIConfig);
      expect(result.isValid).toBe(false);
      expect(result.errors[0]).toContain('AI provider must be one of: openai, anthropic, local. Current value: invalid-provider');
    });

    it('should fail validation for local provider without base URL', () => {
      const invalidAIConfig: AIConfiguration = {
        provider: 'local',
        model: 'local-model',
        customPrompts: {
          daily: 'Daily prompt',
          weekly: 'Weekly prompt',
          monthly: 'Monthly prompt'
        }
      };

      const result = ConfigurationValidator.validateAIConfiguration(invalidAIConfig);
      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('Base URL is required for local AI provider. Please provide the URL to your local AI service (e.g., http://localhost:8080)');
    });

    it('should validate timeout and retry limits', () => {
      const invalidAIConfig: AIConfiguration = {
        provider: 'openai',
        apiKey: 'test-key',
        model: 'gpt-4',
        timeout: -1,
        maxRetries: 15,
        customPrompts: {
          daily: 'Daily prompt',
          weekly: 'Weekly prompt',
          monthly: 'Monthly prompt'
        }
      };

      const result = ConfigurationValidator.validateAIConfiguration(invalidAIConfig);
      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('Timeout must be greater than 0 milliseconds. Recommended: 30000 (30 seconds)');
      expect(result.errors).toContain('Max retries should not exceed 10 to avoid excessive API calls. Recommended: 1-3 retries');
    });
  });

  describe('validateOutputConfiguration', () => {
    it('should validate a valid output configuration', () => {
      const validOutputConfig: OutputConfiguration = {
        format: 'markdown',
        outputPath: './reports',
        includeMetadata: true
      };

      const result = ConfigurationValidator.validateOutputConfiguration(validOutputConfig);
      expect(result.isValid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should fail validation for invalid format', () => {
      const invalidOutputConfig = {
        format: 'invalid-format',
        outputPath: './reports',
        includeMetadata: true
      } as OutputConfiguration;

      const result = ConfigurationValidator.validateOutputConfiguration(invalidOutputConfig);
      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('Output format must be either "markdown" or "html". Current value: "invalid-format"');
    });

    it('should fail validation for missing required fields', () => {
      const invalidOutputConfig = {
        includeMetadata: 'not-boolean'
      } as OutputConfiguration;

      const result = ConfigurationValidator.validateOutputConfiguration(invalidOutputConfig);
      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('Output format is required. Please specify "markdown" or "html"');
      expect(result.errors).toContain('Output path is required. Specify a directory path like "./reports" or "/path/to/output"');
      expect(result.errors).toContain('Include metadata flag must be a boolean (true or false)');
    });
  });

  describe('validateReportTypeConfig', () => {
    it('should validate a valid report type configuration', () => {
      const validReportConfig: ReportTypeConfig = {
        type: 'daily',
        enabled: true
      };

      const result = ConfigurationValidator.validateReportTypeConfig(validReportConfig);
      expect(result.isValid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should fail validation for invalid report type', () => {
      const invalidReportConfig = {
        type: 'invalid-type',
        enabled: true
      } as ReportTypeConfig;

      const result = ConfigurationValidator.validateReportTypeConfig(invalidReportConfig);
      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('Report type must be one of: daily, weekly, monthly');
    });
  });

  describe('validateField', () => {
    it('should validate string fields correctly', () => {
      const validResult = ConfigurationValidator.validateField('testField', 'valid string', 'string');
      expect(validResult.isValid).toBe(true);

      const invalidResult = ConfigurationValidator.validateField('testField', '', 'string');
      expect(invalidResult.isValid).toBe(false);
      expect(invalidResult.errors).toContain('testField must be a non-empty string');
    });

    it('should validate boolean fields correctly', () => {
      const validResult = ConfigurationValidator.validateField('testField', true, 'boolean');
      expect(validResult.isValid).toBe(true);

      const invalidResult = ConfigurationValidator.validateField('testField', 'not-boolean', 'boolean');
      expect(invalidResult.isValid).toBe(false);
      expect(invalidResult.errors).toContain('testField must be a boolean');
    });

    it('should validate number fields correctly', () => {
      const validResult = ConfigurationValidator.validateField('testField', 42, 'number');
      expect(validResult.isValid).toBe(true);

      const invalidResult = ConfigurationValidator.validateField('testField', 'not-number', 'number');
      expect(invalidResult.isValid).toBe(false);
      expect(invalidResult.errors).toContain('testField must be a valid number');
    });

    it('should validate array fields correctly', () => {
      const validResult = ConfigurationValidator.validateField('testField', [], 'array');
      expect(validResult.isValid).toBe(true);

      const invalidResult = ConfigurationValidator.validateField('testField', 'not-array', 'array');
      expect(invalidResult.isValid).toBe(false);
      expect(invalidResult.errors).toContain('testField must be an array');
    });

    it('should validate date fields correctly', () => {
      const validResult = ConfigurationValidator.validateField('testField', new Date(), 'date');
      expect(validResult.isValid).toBe(true);

      const invalidResult = ConfigurationValidator.validateField('testField', 'not-date', 'date');
      expect(invalidResult.isValid).toBe(false);
      expect(invalidResult.errors).toContain('testField must be a valid date');
    });
  });

  describe('Enhanced AI Configuration Validation', () => {
    it('should provide detailed error messages for invalid AI provider', () => {
      const invalidAIConfig = {
        provider: 'invalid-provider',
        model: 'test-model',
        customPrompts: {}
      } as AIConfiguration;

      const result = ConfigurationValidator.validateAIConfiguration(invalidAIConfig);
      expect(result.isValid).toBe(false);
      expect(result.errors[0]).toContain('Current value: invalid-provider');
    });

    it('should validate OpenAI API key format', () => {
      const invalidAIConfig: AIConfiguration = {
        provider: 'openai',
        apiKey: 'invalid-key-format',
        model: 'gpt-4',
        customPrompts: {
          daily: 'Daily prompt',
          weekly: 'Weekly prompt',
          monthly: 'Monthly prompt'
        }
      };

      const result = ConfigurationValidator.validateAIConfiguration(invalidAIConfig);
      expect(result.isValid).toBe(true); // Should be valid but with warning
      expect(result.warnings).toContain('OpenAI API keys typically start with "sk-". Please verify your API key format');
    });

    it('should validate local provider base URL format', () => {
      const invalidAIConfig: AIConfiguration = {
        provider: 'local',
        baseUrl: 'invalid-url',
        model: 'local-model',
        customPrompts: {
          daily: 'Daily prompt',
          weekly: 'Weekly prompt',
          monthly: 'Monthly prompt'
        }
      };

      const result = ConfigurationValidator.validateAIConfiguration(invalidAIConfig);
      expect(result.isValid).toBe(false);
      expect(result.errors[0]).toContain('Invalid base URL format');
    });

    it('should warn about short custom prompts', () => {
      const aiConfigWithShortPrompts: AIConfiguration = {
        provider: 'openai',
        apiKey: 'sk-test-key',
        model: 'gpt-4',
        customPrompts: {
          daily: 'Short',
          weekly: 'Weekly prompt',
          monthly: 'Monthly prompt'
        }
      };

      const result = ConfigurationValidator.validateAIConfiguration(aiConfigWithShortPrompts);
      expect(result.isValid).toBe(true);
      expect(result.warnings).toContain('Custom prompt for daily reports is very short (5 characters). Consider providing more detailed instructions');
    });

    it('should validate timeout ranges with specific guidance', () => {
      const aiConfigWithShortTimeout: AIConfiguration = {
        provider: 'openai',
        apiKey: 'sk-test-key',
        model: 'gpt-4',
        timeout: 2000,
        customPrompts: {
          daily: 'Daily prompt',
          weekly: 'Weekly prompt',
          monthly: 'Monthly prompt'
        }
      };

      const result = ConfigurationValidator.validateAIConfiguration(aiConfigWithShortTimeout);
      expect(result.isValid).toBe(true);
      expect(result.warnings).toContain('Timeout of 2000ms may be too short for AI processing. Consider using at least 10000ms (10 seconds)');
    });
  });

  describe('Enhanced Git Data Source Validation', () => {
    it('should validate repository credentials thoroughly', () => {
      const gitConfigWithInvalidCredentials: GitDataSourceConfig = {
        type: 'git',
        enabled: true,
        name: 'test-git',
        repositories: [{
          name: 'test-repo',
          path: '/path/to/repo',
          credentials: {
            username: '',
            token: 'abc'
          }
        }]
      };

      const result = ConfigurationValidator.validateGitDataSource(gitConfigWithInvalidCredentials);
      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('Repository 0: credentials username is required when credentials are provided');
      expect(result.warnings).toContain('Repository 0: credentials token seems very short (3 characters). Ensure you\'re using a valid personal access token');
    });

    it('should warn about HTTP URLs with credentials', () => {
      const gitConfigWithHttpCredentials: GitDataSourceConfig = {
        type: 'git',
        enabled: true,
        name: 'test-git',
        repositories: [{
          name: 'test-repo',
          path: '/path/to/repo',
          remote: 'http://github.com/user/repo.git',
          credentials: {
            username: 'user',
            token: 'token123456'
          }
        }]
      };

      const result = ConfigurationValidator.validateGitDataSource(gitConfigWithHttpCredentials);
      expect(result.isValid).toBe(true);
      expect(result.warnings).toContain('Repository 0: using HTTP instead of HTTPS for remote repository may expose credentials. Consider using HTTPS');
    });

    it('should validate remote URL format', () => {
      const gitConfigWithInvalidRemote: GitDataSourceConfig = {
        type: 'git',
        enabled: true,
        name: 'test-git',
        repositories: [{
          name: 'test-repo',
          path: '/path/to/repo',
          remote: 'not-a-url'
        }]
      };

      const result = ConfigurationValidator.validateGitDataSource(gitConfigWithInvalidRemote);
      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('Repository 0: invalid remote URL format "not-a-url". Use format like "https://github.com/user/repo.git"');
    });
  });

  describe('Enhanced Output Configuration Validation', () => {
    it('should validate output path security', () => {
      const outputConfigWithDangerousPath: OutputConfiguration = {
        format: 'markdown',
        outputPath: '../../../etc/passwd',
        includeMetadata: true
      };

      const result = ConfigurationValidator.validateOutputConfiguration(outputConfigWithDangerousPath);
      expect(result.isValid).toBe(true); // Valid but with warning
      expect(result.warnings).toContain('Output path contains ".." which may reference parent directories. Ensure this is intentional for security');
    });

    it('should validate path format for different platforms', () => {
      // Mock Windows platform
      const originalPlatform = process.platform;
      Object.defineProperty(process, 'platform', { value: 'win32' });

      const outputConfigWithUnixPath: OutputConfiguration = {
        format: 'markdown',
        outputPath: '/unix/style/path',
        includeMetadata: true
      };

      const result = ConfigurationValidator.validateOutputConfiguration(outputConfigWithUnixPath);
      expect(result.isValid).toBe(true);
      expect(result.warnings).toContain('Output path starts with "/" on Windows. Consider using Windows-style paths like "C:\\reports" or relative paths like ".\\reports"');

      // Restore original platform
      Object.defineProperty(process, 'platform', { value: originalPlatform });
    });

    it('should validate invalid path characters', () => {
      const outputConfigWithInvalidChars: OutputConfiguration = {
        format: 'markdown',
        outputPath: 'path/with<invalid>chars',
        includeMetadata: true
      };

      const result = ConfigurationValidator.validateOutputConfiguration(outputConfigWithInvalidChars);
      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('Output path contains invalid characters (<>:"|?*). Use only valid path characters');
    });
  });

  describe('validateConfigurationEdgeCases', () => {
    it('should detect duplicate data source names', () => {
      const configWithDuplicates: SystemConfig = {
        version: '1.0.0',
        lastUpdated: new Date(),
        dataSources: [
          {
            type: 'git',
            enabled: true,
            name: 'duplicate-name',
            repositories: [{ name: 'repo1', path: '/path1' }]
          } as GitDataSourceConfig,
          {
            type: 'git',
            enabled: true,
            name: 'duplicate-name',
            repositories: [{ name: 'repo2', path: '/path2' }]
          } as GitDataSourceConfig
        ],
        aiConfig: {
          provider: 'openai',
          apiKey: 'sk-test',
          model: 'gpt-4',
          customPrompts: { daily: 'test', weekly: 'test', monthly: 'test' }
        },
        outputConfig: {
          format: 'markdown',
          outputPath: './reports',
          includeMetadata: true
        },
        reportTypes: [{ type: 'daily', enabled: true }]
      };

      const result = ConfigurationValidator.validateConfigurationEdgeCases(configWithDuplicates);
      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('Duplicate data source names found: duplicate-name. Each data source must have a unique name');
    });

    it('should warn about non-semantic version format', () => {
      const configWithBadVersion: SystemConfig = {
        version: 'v1.0',
        lastUpdated: new Date(),
        dataSources: [{
          type: 'git',
          enabled: true,
          name: 'test',
          repositories: [{ name: 'repo', path: '/path' }]
        } as GitDataSourceConfig],
        aiConfig: {
          provider: 'openai',
          apiKey: 'sk-test',
          model: 'gpt-4',
          customPrompts: { daily: 'test', weekly: 'test', monthly: 'test' }
        },
        outputConfig: {
          format: 'markdown',
          outputPath: './reports',
          includeMetadata: true
        },
        reportTypes: [{ type: 'daily', enabled: true }]
      };

      const result = ConfigurationValidator.validateConfigurationEdgeCases(configWithBadVersion);
      expect(result.isValid).toBe(true);
      expect(result.warnings).toContain('Version "v1.0" does not follow semantic versioning (e.g., "1.0.0"). Consider using standard version format');
    });

    it('should warn about excessive total timeout', () => {
      const configWithLongTimeout: SystemConfig = {
        version: '1.0.0',
        lastUpdated: new Date(),
        dataSources: [{
          type: 'git',
          enabled: true,
          name: 'test',
          repositories: [{ name: 'repo', path: '/path' }]
        } as GitDataSourceConfig],
        aiConfig: {
          provider: 'openai',
          apiKey: 'sk-test',
          model: 'gpt-4',
          timeout: 120000,
          maxRetries: 10,
          customPrompts: { daily: 'test', weekly: 'test', monthly: 'test' }
        },
        outputConfig: {
          format: 'markdown',
          outputPath: './reports',
          includeMetadata: true
        },
        reportTypes: [{ type: 'daily', enabled: true }]
      };

      const result = ConfigurationValidator.validateConfigurationEdgeCases(configWithLongTimeout);
      expect(result.isValid).toBe(true);
      expect(result.warnings).toContain('Total timeout with retries (1320000ms) exceeds 10 minutes. This may cause very long wait times');
    });
  });

  describe('validateConfigurationCompleteness', () => {
    it('should detect no enabled data sources', () => {
      const configWithNoEnabledSources: SystemConfig = {
        version: '1.0.0',
        lastUpdated: new Date(),
        dataSources: [{
          type: 'git',
          enabled: false,
          name: 'test',
          repositories: [{ name: 'repo', path: '/path' }]
        } as GitDataSourceConfig],
        aiConfig: {
          provider: 'openai',
          apiKey: 'sk-test',
          model: 'gpt-4',
          customPrompts: { daily: 'test', weekly: 'test', monthly: 'test' }
        },
        outputConfig: {
          format: 'markdown',
          outputPath: './reports',
          includeMetadata: true
        },
        reportTypes: [{ type: 'daily', enabled: true }]
      };

      const result = ConfigurationValidator.validateConfigurationCompleteness(configWithNoEnabledSources);
      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('No data sources are enabled. Enable at least one data source to generate reports');
    });

    it('should warn about no enabled report types', () => {
      const configWithNoEnabledReports: SystemConfig = {
        version: '1.0.0',
        lastUpdated: new Date(),
        dataSources: [{
          type: 'git',
          enabled: true,
          name: 'test',
          repositories: [{ name: 'repo', path: '/path' }]
        } as GitDataSourceConfig],
        aiConfig: {
          provider: 'openai',
          apiKey: 'sk-test',
          model: 'gpt-4',
          customPrompts: { daily: 'test', weekly: 'test', monthly: 'test' }
        },
        outputConfig: {
          format: 'markdown',
          outputPath: './reports',
          includeMetadata: true
        },
        reportTypes: [{ type: 'daily', enabled: false }]
      };

      const result = ConfigurationValidator.validateConfigurationCompleteness(configWithNoEnabledReports);
      expect(result.isValid).toBe(true);
      expect(result.warnings).toContain('No report types are enabled. Enable at least one report type (daily, weekly, or monthly) to generate reports');
    });
  });

  describe('createEnhancedDefaultConfiguration', () => {
    it('should create configuration with user preferences', () => {
      const config = ConfigurationValidator.createEnhancedDefaultConfiguration({
        preferredProvider: 'anthropic',
        preferredFormat: 'html',
        enableAllReportTypes: true,
        customOutputPath: '/custom/path'
      });

      expect(config.aiConfig.provider).toBe('anthropic');
      expect(config.aiConfig.model).toBe('claude-3-sonnet');
      expect(config.outputConfig.format).toBe('html');
      expect(config.outputConfig.outputPath).toBe('/custom/path');
      expect(config.reportTypes.every(rt => rt.enabled)).toBe(true);
    });

    it('should set appropriate defaults for local provider', () => {
      const config = ConfigurationValidator.createEnhancedDefaultConfiguration({
        preferredProvider: 'local'
      });

      expect(config.aiConfig.provider).toBe('local');
      expect(config.aiConfig.model).toBe('local-model');
      expect(config.aiConfig.baseUrl).toBe('http://localhost:8080');
    });
  });

  describe('sanitizeConfiguration', () => {
    it('should trim whitespace from string fields', () => {
      const dirtyConfig: SystemConfig = {
        version: '  1.0.0  ',
        lastUpdated: new Date(),
        dataSources: [{
          type: 'git',
          enabled: true,
          name: '  test-repo  ',
          repositories: [{
            name: '  repo  ',
            path: '  /path  ',
            branch: '  main  ',
            remote: '  https://github.com/user/repo.git  ',
            credentials: {
              username: '  user  ',
              token: '  token123  '
            }
          }]
        } as GitDataSourceConfig],
        aiConfig: {
          provider: 'openai',
          apiKey: '  sk-test-key  ',
          model: '  gpt-4  ',
          baseUrl: '  http://localhost  ',
          customPrompts: { daily: 'test', weekly: 'test', monthly: 'test' }
        },
        outputConfig: {
          format: 'markdown',
          outputPath: '  ./reports  ',
          includeMetadata: true
        },
        reportTypes: [{ type: 'daily', enabled: true }]
      };

      const sanitized = ConfigurationValidator.sanitizeConfiguration(dirtyConfig);

      expect(sanitized.version).toBe('1.0.0');
      expect(sanitized.dataSources[0].name).toBe('test-repo');
      expect((sanitized.dataSources[0] as GitDataSourceConfig).repositories[0].name).toBe('repo');
      expect((sanitized.dataSources[0] as GitDataSourceConfig).repositories[0].path).toBe('/path');
      expect(sanitized.aiConfig.apiKey).toBe('sk-test-key');
      expect(sanitized.aiConfig.model).toBe('gpt-4');
      expect(sanitized.outputConfig.outputPath).toBe('./reports');
    });
  });
});