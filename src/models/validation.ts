// Configuration validation functions
import {
  SystemConfig,
  DataSourceConfig,
  GitDataSourceConfig,
  AIConfiguration,
  OutputConfiguration,
  ReportTypeConfig,
  ValidationResult,
  AIProvider,
  OutputFormat,
  ReportType
} from './config';

export class ConfigurationValidator {
  /**
   * Validates the complete system configuration
   */
  static validateSystemConfig(config: SystemConfig): ValidationResult {
    const errors: string[] = [];
    const warnings: string[] = [];

    // Validate required fields
    if (!config.version) {
      errors.push('System configuration must include a version');
    }

    if (!config.lastUpdated) {
      errors.push('System configuration must include lastUpdated timestamp');
    }

    // Validate data sources
    if (!config.dataSources || config.dataSources.length === 0) {
      errors.push('At least one data source must be configured');
    } else {
      config.dataSources.forEach((source, index) => {
        const sourceValidation = this.validateDataSource(source);
        if (!sourceValidation.isValid) {
          errors.push(...sourceValidation.errors.map(err => `Data source ${index}: ${err}`));
        }
        if (sourceValidation.warnings) {
          warnings.push(...sourceValidation.warnings.map(warn => `Data source ${index}: ${warn}`));
        }
      });
    }

    // Validate AI configuration
    const aiValidation = this.validateAIConfiguration(config.aiConfig);
    if (!aiValidation.isValid) {
      errors.push(...aiValidation.errors.map(err => `AI configuration: ${err}`));
    }
    if (aiValidation.warnings) {
      warnings.push(...aiValidation.warnings.map(warn => `AI configuration: ${warn}`));
    }

    // Validate output configuration
    const outputValidation = this.validateOutputConfiguration(config.outputConfig);
    if (!outputValidation.isValid) {
      errors.push(...outputValidation.errors.map(err => `Output configuration: ${err}`));
    }

    // Validate report types
    if (!config.reportTypes || config.reportTypes.length === 0) {
      warnings.push('No report types configured - using defaults');
    } else {
      config.reportTypes.forEach((reportType, index) => {
        const reportValidation = this.validateReportTypeConfig(reportType);
        if (!reportValidation.isValid) {
          errors.push(...reportValidation.errors.map(err => `Report type ${index}: ${err}`));
        }
      });
    }

    return {
      isValid: errors.length === 0,
      errors,
      warnings: warnings.length > 0 ? warnings : undefined
    };
  }

  /**
   * Validates data source configuration
   */
  static validateDataSource(config: DataSourceConfig): ValidationResult {
    const errors: string[] = [];

    if (!config.type) {
      errors.push('Data source type is required');
    }

    if (!config.name) {
      errors.push('Data source name is required');
    }

    if (typeof config.enabled !== 'boolean') {
      errors.push('Data source enabled flag must be a boolean');
    }

    // Validate git-specific configuration
    if (config.type === 'git') {
      const gitValidation = this.validateGitDataSource(config as GitDataSourceConfig);
      if (!gitValidation.isValid) {
        errors.push(...gitValidation.errors);
      }
    }

    return {
      isValid: errors.length === 0,
      errors
    };
  }

  /**
   * Validates git data source configuration
   */
  static validateGitDataSource(config: GitDataSourceConfig): ValidationResult {
    const errors: string[] = [];
    const warnings: string[] = [];

    if (!config.repositories || config.repositories.length === 0) {
      errors.push('Git data source must have at least one repository configured');
    } else {
      config.repositories.forEach((repo, index) => {
        if (!repo.name) {
          errors.push(`Repository ${index}: name is required`);
        }
        if (!repo.path) {
          errors.push(`Repository ${index}: path is required`);
        }
        
        // Validate credentials if provided
        if (repo.credentials) {
          if (!repo.credentials.username) {
            errors.push(`Repository ${index}: credentials username is required`);
          }
          if (!repo.credentials.token) {
            errors.push(`Repository ${index}: credentials token is required`);
          }
        }

        // Warn if remote is specified but no credentials
        if (repo.remote && !repo.credentials) {
          warnings.push(`Repository ${index}: remote repository specified but no credentials provided`);
        }
      });
    }

    return {
      isValid: errors.length === 0,
      errors,
      warnings: warnings.length > 0 ? warnings : undefined
    };
  }

  /**
   * Validates AI configuration
   */
  static validateAIConfiguration(config: AIConfiguration): ValidationResult {
    const errors: string[] = [];
    const warnings: string[] = [];

    if (!config.provider) {
      errors.push('AI provider is required');
    } else if (!['openai', 'anthropic', 'local'].includes(config.provider)) {
      errors.push('AI provider must be one of: openai, anthropic, local');
    }

    if (!config.model) {
      errors.push('AI model is required');
    }

    // Validate API key for external providers (warn if empty, error if undefined)
    if (config.provider === 'openai' || config.provider === 'anthropic') {
      if (config.apiKey === undefined) {
        errors.push(`API key is required for ${config.provider} provider`);
      } else if (config.apiKey === '') {
        warnings.push(`API key is empty for ${config.provider} provider - please configure before use`);
      }
    }

    // Validate base URL for local provider
    if (config.provider === 'local' && !config.baseUrl) {
      errors.push('Base URL is required for local AI provider');
    }

    // Validate custom prompts
    if (!config.customPrompts) {
      warnings.push('No custom prompts configured - using defaults');
    } else {
      const requiredPromptTypes: ReportType[] = ['daily', 'weekly', 'monthly'];
      requiredPromptTypes.forEach(type => {
        if (!config.customPrompts[type]) {
          warnings.push(`No custom prompt configured for ${type} reports`);
        }
      });
    }

    // Validate timeout and retries
    if (config.timeout !== undefined && (config.timeout <= 0 || config.timeout > 300000)) {
      errors.push('Timeout must be between 1 and 300000 milliseconds');
    }

    if (config.maxRetries !== undefined && (config.maxRetries < 0 || config.maxRetries > 10)) {
      errors.push('Max retries must be between 0 and 10');
    }

    return {
      isValid: errors.length === 0,
      errors,
      warnings: warnings.length > 0 ? warnings : undefined
    };
  }

  /**
   * Validates output configuration
   */
  static validateOutputConfiguration(config: OutputConfiguration): ValidationResult {
    const errors: string[] = [];

    if (!config.format) {
      errors.push('Output format is required');
    } else if (!['markdown', 'html'].includes(config.format)) {
      errors.push('Output format must be either markdown or html');
    }

    if (!config.outputPath) {
      errors.push('Output path is required');
    }

    if (typeof config.includeMetadata !== 'boolean') {
      errors.push('Include metadata flag must be a boolean');
    }

    return {
      isValid: errors.length === 0,
      errors
    };
  }

  /**
   * Validates report type configuration
   */
  static validateReportTypeConfig(config: ReportTypeConfig): ValidationResult {
    const errors: string[] = [];

    if (!config.type) {
      errors.push('Report type is required');
    } else if (!['daily', 'weekly', 'monthly'].includes(config.type)) {
      errors.push('Report type must be one of: daily, weekly, monthly');
    }

    if (typeof config.enabled !== 'boolean') {
      errors.push('Report type enabled flag must be a boolean');
    }

    return {
      isValid: errors.length === 0,
      errors
    };
  }

  /**
   * Validates individual field values
   */
  static validateField(fieldName: string, value: any, type: string): ValidationResult {
    const errors: string[] = [];

    switch (type) {
      case 'string':
        if (typeof value !== 'string' || value.trim() === '') {
          errors.push(`${fieldName} must be a non-empty string`);
        }
        break;
      case 'boolean':
        if (typeof value !== 'boolean') {
          errors.push(`${fieldName} must be a boolean`);
        }
        break;
      case 'number':
        if (typeof value !== 'number' || isNaN(value)) {
          errors.push(`${fieldName} must be a valid number`);
        }
        break;
      case 'array':
        if (!Array.isArray(value)) {
          errors.push(`${fieldName} must be an array`);
        }
        break;
      case 'date':
        if (!(value instanceof Date) || isNaN(value.getTime())) {
          errors.push(`${fieldName} must be a valid date`);
        }
        break;
      default:
        errors.push(`Unknown validation type: ${type}`);
    }

    return {
      isValid: errors.length === 0,
      errors
    };
  }
}