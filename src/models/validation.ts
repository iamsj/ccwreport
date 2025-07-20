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
  // Default configuration values
  static readonly DEFAULT_TIMEOUT = 30000; // 30 seconds
  static readonly DEFAULT_MAX_RETRIES = 3;
  static readonly DEFAULT_FORMAT = 'markdown' as OutputFormat;
  static readonly DEFAULT_OUTPUT_PATH = './reports';
  static readonly DEFAULT_INCLUDE_METADATA = true;
  static readonly DEFAULT_REPORT_TYPES: ReportType[] = ['daily', 'weekly', 'monthly'];
  static readonly DEFAULT_PROVIDER = 'openai' as AIProvider;
  static readonly DEFAULT_MODEL = 'gpt-4';
  static readonly DEFAULT_VERSION = '1.0.0';
  static readonly DEFAULT_BRANCH = 'main';
  
  /**
   * Applies default values to missing configuration fields
   */
  static applyDefaults(config: Partial<SystemConfig>): SystemConfig {
    // Create a new config object with defaults
    const defaultedConfig: SystemConfig = {
      version: config.version || this.DEFAULT_VERSION,
      lastUpdated: config.lastUpdated || new Date(),
      dataSources: config.dataSources || [{
        type: 'git',
        enabled: true,
        name: 'default-git',
        repositories: [{
          name: 'current-repo',
          path: '.',
          branch: this.DEFAULT_BRANCH
        }]
      } as GitDataSourceConfig],
      aiConfig: {
        provider: config.aiConfig?.provider || this.DEFAULT_PROVIDER,
        apiKey: config.aiConfig?.apiKey || '',
        model: config.aiConfig?.model || this.DEFAULT_MODEL,
        timeout: config.aiConfig?.timeout || this.DEFAULT_TIMEOUT,
        maxRetries: config.aiConfig?.maxRetries || this.DEFAULT_MAX_RETRIES,
        customPrompts: config.aiConfig?.customPrompts || {
          daily: 'Generate a concise daily report summarizing the git commits from today. Focus on key changes, features, and bug fixes.',
          weekly: 'Create a comprehensive weekly report highlighting major developments, completed features, and overall progress from the past week\'s git commits.',
          monthly: 'Produce a detailed monthly report showcasing significant achievements, major features delivered, and development trends from the past month\'s git activity.'
        }
      },
      outputConfig: {
        format: config.outputConfig?.format || this.DEFAULT_FORMAT,
        outputPath: config.outputConfig?.outputPath || this.DEFAULT_OUTPUT_PATH,
        includeMetadata: config.outputConfig?.includeMetadata !== undefined ? 
          config.outputConfig.includeMetadata : this.DEFAULT_INCLUDE_METADATA,
        styling: config.outputConfig?.styling || undefined
      },
      reportTypes: config.reportTypes || [
        { type: 'daily', enabled: true },
        { type: 'weekly', enabled: true },
        { type: 'monthly', enabled: false }
      ]
    };
    
    return defaultedConfig;
  }
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
      errors.push('Git data source must have at least one repository configured. Add a repository with name and path properties');
    } else {
      config.repositories.forEach((repo, index) => {
        if (!repo.name) {
          errors.push(`Repository ${index}: name is required. Provide a descriptive name for this repository`);
        } else if (repo.name.trim().length === 0) {
          errors.push(`Repository ${index}: name cannot be empty. Provide a descriptive name for this repository`);
        }
        
        if (!repo.path) {
          errors.push(`Repository ${index}: path is required. Provide the local path to the git repository (e.g., "." for current directory or "/path/to/repo")`);
        } else if (repo.path.trim().length === 0) {
          errors.push(`Repository ${index}: path cannot be empty. Provide the local path to the git repository`);
        }
        
        // Validate branch name if provided
        if (repo.branch && repo.branch.trim().length === 0) {
          errors.push(`Repository ${index}: branch name cannot be empty. Use "main", "master", or your target branch name`);
        }
        
        // Validate remote URL format if provided
        if (repo.remote) {
          if (repo.remote.trim().length === 0) {
            errors.push(`Repository ${index}: remote URL cannot be empty`);
          } else {
            try {
              new URL(repo.remote);
              // Check for common git URL patterns
              if (!repo.remote.includes('git') && !repo.remote.endsWith('.git')) {
                warnings.push(`Repository ${index}: remote URL "${repo.remote}" may not be a valid git repository URL`);
              }
            } catch {
              errors.push(`Repository ${index}: invalid remote URL format "${repo.remote}". Use format like "https://github.com/user/repo.git"`);
            }
          }
        }
        
        // Validate credentials if provided
        if (repo.credentials) {
          if (!repo.credentials.username) {
            errors.push(`Repository ${index}: credentials username is required when credentials are provided`);
          } else if (repo.credentials.username.trim().length === 0) {
            errors.push(`Repository ${index}: credentials username cannot be empty`);
          }
          
          if (!repo.credentials.token) {
            errors.push(`Repository ${index}: credentials token is required when credentials are provided. Use a personal access token, not a password`);
          } else if (repo.credentials.token.trim().length === 0) {
            errors.push(`Repository ${index}: credentials token cannot be empty`);
          } else if (repo.credentials.token.length < 10) {
            warnings.push(`Repository ${index}: credentials token seems very short (${repo.credentials.token.length} characters). Ensure you're using a valid personal access token`);
          }
        }

        // Warn if remote is specified but no credentials
        if (repo.remote && !repo.credentials) {
          warnings.push(`Repository ${index}: remote repository "${repo.remote}" specified but no credentials provided. This may cause authentication issues for private repositories`);
        }
        
        // Warn about potential security issues
        if (repo.credentials && repo.remote && repo.remote.startsWith('http://')) {
          warnings.push(`Repository ${index}: using HTTP instead of HTTPS for remote repository may expose credentials. Consider using HTTPS`);
        }
      });
    }

    // Validate username filter if provided
    if (config.username !== undefined) {
      if (typeof config.username !== 'string') {
        errors.push('Username filter must be a string');
      } else if (config.username.trim().length === 0) {
        warnings.push('Username filter is empty - will include commits from all authors');
      }
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
      errors.push('AI provider is required. Please specify one of: openai, anthropic, or local');
    } else if (!['openai', 'anthropic', 'local'].includes(config.provider)) {
      errors.push('AI provider must be one of: openai, anthropic, local. Current value: ' + config.provider);
    }

    if (!config.model) {
      errors.push('AI model is required. For OpenAI use models like "gpt-4" or "gpt-3.5-turbo", for Anthropic use "claude-3-opus" or "claude-3-sonnet"');
    } else {
      // Validate model names for specific providers
      if (config.provider === 'openai' && !config.model.startsWith('gpt-')) {
        warnings.push(`Model "${config.model}" may not be a valid OpenAI model. Consider using gpt-4, gpt-3.5-turbo, or other GPT models`);
      } else if (config.provider === 'anthropic' && !config.model.includes('claude')) {
        warnings.push(`Model "${config.model}" may not be a valid Anthropic model. Consider using claude-3-opus, claude-3-sonnet, or other Claude models`);
      }
    }

    // Validate API key for external providers (warn if empty, error if undefined)
    if (config.provider === 'openai' || config.provider === 'anthropic') {
      if (config.apiKey === undefined) {
        errors.push(`API key is required for ${config.provider} provider. Please obtain an API key from ${config.provider === 'openai' ? 'https://platform.openai.com/api-keys' : 'https://console.anthropic.com/'}`);
      } else if (config.apiKey === '') {
        warnings.push(`API key is empty for ${config.provider} provider - please configure before use`);
      } else if (config.provider === 'openai' && !config.apiKey.startsWith('sk-')) {
        warnings.push('OpenAI API keys typically start with "sk-". Please verify your API key format');
      }
    }

    // Validate base URL for local provider
    if (config.provider === 'local') {
      if (!config.baseUrl) {
        errors.push('Base URL is required for local AI provider. Please provide the URL to your local AI service (e.g., http://localhost:8080)');
      } else {
        try {
          new URL(config.baseUrl);
        } catch {
          errors.push(`Invalid base URL format: "${config.baseUrl}". Please provide a valid URL (e.g., http://localhost:8080)`);
        }
      }
    }

    // Validate custom prompts
    if (!config.customPrompts) {
      warnings.push('No custom prompts configured - using defaults');
    } else {
      const requiredPromptTypes: ReportType[] = ['daily', 'weekly', 'monthly'];
      requiredPromptTypes.forEach(type => {
        if (!config.customPrompts[type]) {
          warnings.push(`No custom prompt configured for ${type} reports - using default prompt`);
        } else if (config.customPrompts[type].trim().length < 10) {
          warnings.push(`Custom prompt for ${type} reports is very short (${config.customPrompts[type].length} characters). Consider providing more detailed instructions`);
        }
      });
    }

    // Validate timeout and retries with more specific guidance
    if (config.timeout !== undefined) {
      if (config.timeout <= 0) {
        errors.push('Timeout must be greater than 0 milliseconds. Recommended: 30000 (30 seconds)');
      } else if (config.timeout > 300000) {
        errors.push('Timeout must be less than 300000 milliseconds (5 minutes). Recommended: 30000-120000 (30 seconds to 2 minutes)');
      } else if (config.timeout < 5000) {
        warnings.push(`Timeout of ${config.timeout}ms may be too short for AI processing. Consider using at least 10000ms (10 seconds)`);
      }
    }

    if (config.maxRetries !== undefined) {
      if (config.maxRetries < 0) {
        errors.push('Max retries cannot be negative. Use 0 for no retries, or 1-5 for reasonable retry attempts');
      } else if (config.maxRetries > 10) {
        errors.push('Max retries should not exceed 10 to avoid excessive API calls. Recommended: 1-3 retries');
      } else if (config.maxRetries > 5) {
        warnings.push(`${config.maxRetries} retries may result in long wait times. Consider using 1-3 retries for better user experience`);
      }
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
    const warnings: string[] = [];

    if (!config.format) {
      errors.push('Output format is required. Please specify "markdown" or "html"');
    } else if (!['markdown', 'html'].includes(config.format)) {
      errors.push(`Output format must be either "markdown" or "html". Current value: "${config.format}"`);
    }

    if (!config.outputPath) {
      errors.push('Output path is required. Specify a directory path like "./reports" or "/path/to/output"');
    } else if (config.outputPath.trim().length === 0) {
      errors.push('Output path cannot be empty. Specify a directory path like "./reports" or "/path/to/output"');
    } else {
      // Validate path format and provide warnings for potential issues
      if (config.outputPath.includes('..')) {
        warnings.push('Output path contains ".." which may reference parent directories. Ensure this is intentional for security');
      }
      
      if (config.outputPath.startsWith('/') && process.platform === 'win32') {
        warnings.push('Output path starts with "/" on Windows. Consider using Windows-style paths like "C:\\reports" or relative paths like ".\\reports"');
      }
      
      if (config.outputPath.includes('\\') && process.platform !== 'win32') {
        warnings.push('Output path contains backslashes on non-Windows system. Consider using forward slashes');
      }
      
      // Check for potentially problematic characters
      const problematicChars = /[<>:"|?*]/;
      if (problematicChars.test(config.outputPath)) {
        errors.push(`Output path contains invalid characters (<>:"|?*). Use only valid path characters`);
      }
    }

    if (typeof config.includeMetadata !== 'boolean') {
      errors.push('Include metadata flag must be a boolean (true or false)');
    }

    // Validate styling configuration if provided
    if (config.styling !== undefined) {
      if (config.format === 'markdown' && config.styling) {
        warnings.push('Styling configuration provided for markdown format. Styling is primarily used for HTML output');
      }
      
      if (typeof config.styling === 'object' && config.styling !== null) {
        // Validate CSS-like styling properties
        const validStyleProps = ['color', 'backgroundColor', 'fontSize', 'fontFamily', 'margin', 'padding'];
        Object.keys(config.styling).forEach(prop => {
          if (!validStyleProps.includes(prop)) {
            warnings.push(`Unknown styling property "${prop}". Consider using standard CSS properties`);
          }
        });
      }
    }

    return {
      isValid: errors.length === 0,
      errors,
      warnings: warnings.length > 0 ? warnings : undefined
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

  /**
   * Validates configuration for edge cases and potential issues
   */
  static validateConfigurationEdgeCases(config: SystemConfig): ValidationResult {
    const errors: string[] = [];
    const warnings: string[] = [];

    // Check for circular dependencies or conflicts
    if (config.dataSources && config.dataSources.length > 1) {
      const names = config.dataSources.map(ds => ds.name);
      const duplicateNames = names.filter((name, index) => names.indexOf(name) !== index);
      if (duplicateNames.length > 0) {
        errors.push(`Duplicate data source names found: ${duplicateNames.join(', ')}. Each data source must have a unique name`);
      }
    }

    // Validate version format
    if (config.version && !/^\d+\.\d+\.\d+(-.*)?$/.test(config.version)) {
      warnings.push(`Version "${config.version}" does not follow semantic versioning (e.g., "1.0.0"). Consider using standard version format`);
    }

    // Check for potentially problematic configurations
    if (config.aiConfig.timeout && config.aiConfig.maxRetries) {
      const totalTimeout = config.aiConfig.timeout * (config.aiConfig.maxRetries + 1);
      if (totalTimeout > 600000) { // 10 minutes
        warnings.push(`Total timeout with retries (${totalTimeout}ms) exceeds 10 minutes. This may cause very long wait times`);
      }
    }

    // Validate date consistency
    if (config.lastUpdated && config.lastUpdated > new Date()) {
      warnings.push('Configuration lastUpdated timestamp is in the future. This may indicate a clock synchronization issue');
    }

    // Check for security concerns
    if (config.dataSources) {
      config.dataSources.forEach((source, index) => {
        if (source.type === 'git') {
          const gitSource = source as GitDataSourceConfig;
          gitSource.repositories?.forEach((repo, repoIndex) => {
            if (repo.credentials && repo.credentials.token && repo.credentials.token.length > 100) {
              warnings.push(`Data source ${index}, repository ${repoIndex}: credentials token is unusually long (${repo.credentials.token.length} characters). Ensure this is correct`);
            }
          });
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
   * Validates configuration completeness and provides suggestions
   */
  static validateConfigurationCompleteness(config: SystemConfig): ValidationResult {
    const errors: string[] = [];
    const warnings: string[] = [];

    // Check if all report types have at least one enabled data source
    const enabledDataSources = config.dataSources?.filter(ds => ds.enabled) || [];
    if (enabledDataSources.length === 0) {
      errors.push('No data sources are enabled. Enable at least one data source to generate reports');
    }

    // Check if any report types are enabled
    const enabledReportTypes = config.reportTypes?.filter(rt => rt.enabled) || [];
    if (enabledReportTypes.length === 0) {
      warnings.push('No report types are enabled. Enable at least one report type (daily, weekly, or monthly) to generate reports');
    }

    // Validate AI configuration completeness
    if (config.aiConfig.provider === 'openai' || config.aiConfig.provider === 'anthropic') {
      if (!config.aiConfig.apiKey || config.aiConfig.apiKey.trim() === '') {
        errors.push(`AI provider "${config.aiConfig.provider}" requires an API key. Please configure your API key before generating reports`);
      }
    }

    // Check for missing custom prompts for enabled report types
    enabledReportTypes.forEach(reportType => {
      if (!config.aiConfig.customPrompts || !config.aiConfig.customPrompts[reportType.type]) {
        warnings.push(`No custom prompt configured for enabled report type "${reportType.type}". Default prompt will be used`);
      }
    });

    return {
      isValid: errors.length === 0,
      errors,
      warnings: warnings.length > 0 ? warnings : undefined
    };
  }

  /**
   * Comprehensive validation that combines all validation checks
   */
  static validateConfigurationComprehensive(config: SystemConfig): ValidationResult {
    const results = [
      this.validateSystemConfig(config),
      this.validateConfigurationEdgeCases(config),
      this.validateConfigurationCompleteness(config)
    ];

    const allErrors = results.flatMap(r => r.errors);
    const allWarnings = results.flatMap(r => r.warnings || []);

    return {
      isValid: allErrors.length === 0,
      errors: allErrors,
      warnings: allWarnings.length > 0 ? allWarnings : undefined
    };
  }

  /**
   * Creates a configuration with enhanced defaults based on user environment
   */
  static createEnhancedDefaultConfiguration(options?: {
    preferredProvider?: AIProvider;
    preferredFormat?: OutputFormat;
    enableAllReportTypes?: boolean;
    customOutputPath?: string;
  }): SystemConfig {
    const baseConfig = this.applyDefaults({});
    
    if (options) {
      // Apply user preferences
      if (options.preferredProvider) {
        baseConfig.aiConfig.provider = options.preferredProvider;
        
        // Set appropriate default models for different providers
        switch (options.preferredProvider) {
          case 'openai':
            baseConfig.aiConfig.model = 'gpt-4';
            break;
          case 'anthropic':
            baseConfig.aiConfig.model = 'claude-3-sonnet';
            break;
          case 'local':
            baseConfig.aiConfig.model = 'local-model';
            baseConfig.aiConfig.baseUrl = 'http://localhost:8080';
            break;
        }
      }
      
      if (options.preferredFormat) {
        baseConfig.outputConfig.format = options.preferredFormat;
      }
      
      if (options.enableAllReportTypes) {
        baseConfig.reportTypes = [
          { type: 'daily', enabled: true },
          { type: 'weekly', enabled: true },
          { type: 'monthly', enabled: true }
        ];
      }
      
      if (options.customOutputPath) {
        baseConfig.outputConfig.outputPath = options.customOutputPath;
      }
    }
    
    return baseConfig;
  }

  /**
   * Sanitizes configuration by removing or fixing problematic values
   */
  static sanitizeConfiguration(config: SystemConfig): SystemConfig {
    const sanitized = JSON.parse(JSON.stringify(config)); // Deep clone
    
    // Sanitize strings by trimming whitespace
    if (sanitized.version) {
      sanitized.version = sanitized.version.trim();
    }
    
    // Sanitize data sources
    if (sanitized.dataSources) {
      sanitized.dataSources.forEach((source: any) => {
        if (source.name) {
          source.name = source.name.trim();
        }
        
        if (source.type === 'git' && source.repositories) {
          source.repositories.forEach((repo: any) => {
            if (repo.name) repo.name = repo.name.trim();
            if (repo.path) repo.path = repo.path.trim();
            if (repo.branch) repo.branch = repo.branch.trim();
            if (repo.remote) repo.remote = repo.remote.trim();
            
            if (repo.credentials) {
              if (repo.credentials.username) {
                repo.credentials.username = repo.credentials.username.trim();
              }
              if (repo.credentials.token) {
                repo.credentials.token = repo.credentials.token.trim();
              }
            }
          });
        }
      });
    }
    
    // Sanitize AI configuration
    if (sanitized.aiConfig) {
      if (sanitized.aiConfig.apiKey) {
        sanitized.aiConfig.apiKey = sanitized.aiConfig.apiKey.trim();
      }
      if (sanitized.aiConfig.model) {
        sanitized.aiConfig.model = sanitized.aiConfig.model.trim();
      }
      if (sanitized.aiConfig.baseUrl) {
        sanitized.aiConfig.baseUrl = sanitized.aiConfig.baseUrl.trim();
      }
    }
    
    // Sanitize output configuration
    if (sanitized.outputConfig) {
      if (sanitized.outputConfig.outputPath) {
        sanitized.outputConfig.outputPath = sanitized.outputConfig.outputPath.trim();
      }
    }
    
    return sanitized;
  }
}