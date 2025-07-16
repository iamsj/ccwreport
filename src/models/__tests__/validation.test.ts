// Unit tests for configuration validation
import { ConfigurationValidator } from '../validation';
import {
  SystemConfig,
  GitDataSourceConfig,
  AIConfiguration,
  OutputConfiguration,
  ReportTypeConfig
} from '../config';

describe('ConfigurationValidator', () => {
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
      expect(result.errors).toContain('Git data source must have at least one repository configured');
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
      expect(result.errors).toContain('Repository 0: name is required');
      expect(result.errors).toContain('Repository 0: path is required');
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
      expect(result.warnings).toContain('Repository 0: remote repository specified but no credentials provided');
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
      expect(result.errors).toContain('API key is required for openai provider');
    });

    it('should fail validation for invalid provider', () => {
      const invalidAIConfig = {
        provider: 'invalid-provider',
        model: 'test-model',
        customPrompts: {}
      } as AIConfiguration;

      const result = ConfigurationValidator.validateAIConfiguration(invalidAIConfig);
      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('AI provider must be one of: openai, anthropic, local');
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
      expect(result.errors).toContain('Base URL is required for local AI provider');
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
      expect(result.errors).toContain('Timeout must be between 1 and 300000 milliseconds');
      expect(result.errors).toContain('Max retries must be between 0 and 10');
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
      expect(result.errors).toContain('Output format must be either markdown or html');
    });

    it('should fail validation for missing required fields', () => {
      const invalidOutputConfig = {
        includeMetadata: 'not-boolean'
      } as OutputConfiguration;

      const result = ConfigurationValidator.validateOutputConfiguration(invalidOutputConfig);
      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('Output format is required');
      expect(result.errors).toContain('Output path is required');
      expect(result.errors).toContain('Include metadata flag must be a boolean');
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
});