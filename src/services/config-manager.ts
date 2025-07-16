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
      const config = JSON.parse(configData) as SystemConfig;

      // Convert date strings back to Date objects
      config.lastUpdated = new Date(config.lastUpdated);
      
      // Validate configuration if requested
      if (this.options.validateOnLoad) {
        const validation = ConfigurationValidator.validateSystemConfig(config);
        if (!validation.isValid) {
          throw new Error(`Invalid configuration: ${validation.errors.join(', ')}`);
        }
        
        // Log warnings if present
        if (validation.warnings && validation.warnings.length > 0) {
          console.warn('Configuration warnings:', validation.warnings.join(', '));
        }
      }

      return config;
    } catch (error) {
      if (error instanceof SyntaxError) {
        throw new Error(`Invalid JSON in configuration file: ${error.message}`);
      }
      throw error;
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
    } catch (error) {
      throw new Error(`Failed to save configuration: ${error.message}`);
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
      return ConfigurationValidator.validateSystemConfig(config);
    } catch (error) {
      return {
        isValid: false,
        errors: [error.message]
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
    } catch (error) {
      throw new Error(`Failed to create configuration backup: ${error.message}`);
    }
  }

  /**
   * Restores configuration from backup
   */
  async restoreConfiguration(backupPath: string): Promise<void> {
    try {
      await fs.copyFile(backupPath, this.configPath);
    } catch (error) {
      throw new Error(`Failed to restore configuration from backup: ${error.message}`);
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
    return {
      version: '1.0.0',
      lastUpdated: new Date(),
      dataSources: [
        {
          type: 'git',
          enabled: true,
          name: 'default-git',
          repositories: [
            {
              name: 'current-repo',
              path: '.',
              branch: 'main'
            }
          ]
        }
      ],
      aiConfig: {
        provider: 'openai',
        apiKey: '', // User needs to set this
        model: 'gpt-4',
        customPrompts: {
          daily: 'Generate a concise daily report summarizing the git commits from today. Focus on key changes, features, and bug fixes.',
          weekly: 'Create a comprehensive weekly report highlighting major developments, completed features, and overall progress from the past week\'s git commits.',
          monthly: 'Produce a detailed monthly report showcasing significant achievements, major features delivered, and development trends from the past month\'s git activity.'
        },
        timeout: 30000,
        maxRetries: 3
      },
      outputConfig: {
        format: 'markdown',
        outputPath: './reports',
        includeMetadata: true
      },
      reportTypes: [
        {
          type: 'daily',
          enabled: true
        },
        {
          type: 'weekly',
          enabled: true
        },
        {
          type: 'monthly',
          enabled: false
        }
      ]
    };
  }
}