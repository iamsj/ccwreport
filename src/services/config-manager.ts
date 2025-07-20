// Configuration file management service
import * as fs from 'fs/promises';
import * as path from 'path';
import { SystemConfig, ValidationResult } from '../models/config';
import { ConfigurationValidator } from '../models/validation';

export interface ConfigurationManagerOptions {
  configPath?: string;
  createIfMissing?: boolean;
  validateOnLoad?: boolean;
}

export class ConfigurationManager {
  private configPath: string;
  private options: ConfigurationManagerOptions;

  constructor(options: ConfigurationManagerOptions = {}) {
    this.configPath = options.configPath || './config.json';
    this.options = {
      createIfMissing: true,
      validateOnLoad: true,
      ...options
    };
  }

  /**
   * Loads configuration from file
   */
  async loadConfiguration(): Promise<SystemConfig> {
    try {
      // Check if config file exists
      const configExists = await this.configFileExists();

      if (!configExists) {
        if (this.options.createIfMissing) {
          const defaultConfig = this.createDefaultConfiguration();
          await this.saveConfiguration(defaultConfig);
          return defaultConfig;
        } else {
          throw new Error(`Configuration file not found: ${this.configPath}`);
        }
      }

      // Read and parse configuration file
      const configData = await fs.readFile(this.configPath, 'utf-8');
      const parsedConfig = JSON.parse(configData) as Partial<SystemConfig>;

      // Convert date strings back to Date objects
      if (parsedConfig.lastUpdated) {
        parsedConfig.lastUpdated = new Date(parsedConfig.lastUpdated);
      }

      // Apply defaults to ensure all required fields are present
      const config = ConfigurationValidator.applyDefaults(parsedConfig);

      // Validate configuration if requested
      if (this.options.validateOnLoad) {
        const validation = ConfigurationValidator.validateConfigurationComprehensive(config);
        if (!validation.isValid) {
          throw new Error(`Invalid configuration: ${validation.errors.join(', ')}`);
        }

        // Log warnings if present
        if (validation.warnings && validation.warnings.length > 0) {
          console.warn('Configuration warnings:', validation.warnings.join(', '));
        }
      }

      return config;
    } catch (err: any) {
      if (err instanceof SyntaxError) {
        throw new Error(`Invalid JSON in configuration file: ${err.message}`);
      }
      throw err;
    }
  }

  /**
   * Saves configuration to file
   */
  async saveConfiguration(config: SystemConfig): Promise<void> {
    try {
      // Validate configuration before saving
      const validation = ConfigurationValidator.validateSystemConfig(config);
      if (!validation.isValid) {
        throw new Error(`Cannot save invalid configuration: ${validation.errors.join(', ')}`);
      }

      // Update lastUpdated timestamp
      config.lastUpdated = new Date();

      // Ensure directory exists
      const configDir = path.dirname(this.configPath);
      await fs.mkdir(configDir, { recursive: true });

      // Write configuration file with proper formatting
      const configJson = JSON.stringify(config, null, 2);
      await fs.writeFile(this.configPath, configJson, 'utf-8');
    } catch (err: any) {
      throw new Error(`Failed to save configuration: ${err.message}`);
    }
  }

  /**
   * Updates specific configuration sections
   */
  async updateConfiguration(updates: Partial<SystemConfig>): Promise<SystemConfig> {
    const currentConfig = await this.loadConfiguration();
    const updatedConfig = { ...currentConfig, ...updates };
    await this.saveConfiguration(updatedConfig);
    return updatedConfig;
  }

  /**
   * Validates configuration file without loading
   */
  async validateConfigurationFile(): Promise<ValidationResult> {
    try {
      const config = await this.loadConfiguration();
      return ConfigurationValidator.validateConfigurationComprehensive(config);
    } catch (err: any) {
      return {
        isValid: false,
        errors: [err.message]
      };
    }
  }

  /**
   * Sanitizes and saves configuration, fixing common issues
   */
  async sanitizeAndSaveConfiguration(config: SystemConfig): Promise<SystemConfig> {
    try {
      // Sanitize the configuration first
      const sanitizedConfig = ConfigurationValidator.sanitizeConfiguration(config);

      // Apply defaults to ensure completeness
      const completeConfig = ConfigurationValidator.applyDefaults(sanitizedConfig);

      // Save the sanitized configuration
      await this.saveConfiguration(completeConfig);

      return completeConfig;
    } catch (err: any) {
      throw new Error(`Failed to sanitize and save configuration: ${err.message}`);
    }
  }

  /**
   * Creates an enhanced default configuration with user preferences
   */
  createEnhancedDefaultConfiguration(options?: {
    preferredProvider?: 'openai' | 'anthropic' | 'local';
    preferredFormat?: 'markdown' | 'html';
    enableAllReportTypes?: boolean;
    customOutputPath?: string;
  }): SystemConfig {
    return ConfigurationValidator.createEnhancedDefaultConfiguration(options);
  }

  /**
   * Validates configuration completeness and provides detailed feedback
   */
  async validateConfigurationCompleteness(): Promise<ValidationResult> {
    try {
      // Read raw configuration without applying defaults to preserve user settings
      const configExists = await this.configFileExists();
      if (!configExists) {
        return {
          isValid: false,
          errors: ['Configuration file not found']
        };
      }

      const configData = await fs.readFile(this.configPath, 'utf-8');
      const parsedConfig = JSON.parse(configData) as Partial<SystemConfig>;

      // Convert date strings back to Date objects
      if (parsedConfig.lastUpdated) {
        parsedConfig.lastUpdated = new Date(parsedConfig.lastUpdated);
      }

      // Apply defaults but preserve user-specified disabled states
      const config = ConfigurationValidator.applyDefaults(parsedConfig);

      // Override with original user settings for enabled/disabled states
      if (parsedConfig.dataSources) {
        parsedConfig.dataSources.forEach((userSource, index) => {
          if (config.dataSources[index] && userSource.enabled !== undefined) {
            config.dataSources[index].enabled = userSource.enabled;
          }
        });
      }

      if (parsedConfig.reportTypes) {
        parsedConfig.reportTypes.forEach((userReportType, index) => {
          if (config.reportTypes[index] && userReportType.enabled !== undefined) {
            config.reportTypes[index].enabled = userReportType.enabled;
          }
        });
      }

      return ConfigurationValidator.validateConfigurationCompleteness(config);
    } catch (err: any) {
      return {
        isValid: false,
        errors: [err.message]
      };
    }
  }

  /**
   * Checks for edge cases and potential configuration issues
   */
  async validateConfigurationEdgeCases(): Promise<ValidationResult> {
    try {
      // Read raw configuration without applying defaults to preserve user settings
      const configExists = await this.configFileExists();
      if (!configExists) {
        return {
          isValid: false,
          errors: ['Configuration file not found']
        };
      }

      const configData = await fs.readFile(this.configPath, 'utf-8');
      const parsedConfig = JSON.parse(configData) as Partial<SystemConfig>;

      // Convert date strings back to Date objects
      if (parsedConfig.lastUpdated) {
        parsedConfig.lastUpdated = new Date(parsedConfig.lastUpdated);
      }

      // Apply defaults for validation
      const config = ConfigurationValidator.applyDefaults(parsedConfig);

      return ConfigurationValidator.validateConfigurationEdgeCases(config);
    } catch (err: any) {
      return {
        isValid: false,
        errors: [err.message]
      };
    }
  }

  /**
   * Creates a backup of the current configuration
   */
  async backupConfiguration(): Promise<string> {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const backupPath = `${this.configPath}.backup.${timestamp}`;

    try {
      await fs.copyFile(this.configPath, backupPath);
      return backupPath;
    } catch (err: any) {
      throw new Error(`Failed to create configuration backup: ${err.message}`);
    }
  }

  /**
   * Restores configuration from backup
   */
  async restoreConfiguration(backupPath: string): Promise<void> {
    try {
      await fs.copyFile(backupPath, this.configPath);
    } catch (err: any) {
      throw new Error(`Failed to restore configuration from backup: ${err.message}`);
    }
  }

  /**
   * Checks if configuration file exists
   */
  async configFileExists(): Promise<boolean> {
    try {
      await fs.access(this.configPath);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Gets the current configuration file path
   */
  getConfigPath(): string {
    return this.configPath;
  }

  /**
   * Creates a default configuration
   */
  private createDefaultConfiguration(): SystemConfig {
    return ConfigurationValidator.applyDefaults({});
  }
}