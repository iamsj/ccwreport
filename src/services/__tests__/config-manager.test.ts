// Unit tests for ConfigurationManager
import * as fs from 'fs/promises';
import * as path from 'path';
import { ConfigurationManager } from '../config-manager';
import { SystemConfig } from '../../models/config';

// Mock fs module
vi.mock('fs/promises');
const mockFs = vi.mocked(fs);

describe('ConfigurationManager', () => {
  const testConfigPath = './test-config.json';
  let configManager: ConfigurationManager;

  beforeEach(() => {
    vi.clearAllMocks();
    configManager = new ConfigurationManager({ configPath: testConfigPath });
  });

  describe('loadConfiguration', () => {
    it('should load and parse valid configuration file', async () => {
      const mockConfig: SystemConfig = {
        version: '1.0.0',
        lastUpdated: new Date('2024-01-01'),
        dataSources: [{
          type: 'git',
          enabled: true,
          name: 'test-repo',
          repositories: [{
            name: 'test',
            path: '/test/path'
          }]
        }],
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

      mockFs.access.mockResolvedValue(undefined);
      mockFs.readFile.mockResolvedValue(JSON.stringify(mockConfig));

      const result = await configManager.loadConfiguration();

      expect(result.version).toBe('1.0.0');
      expect(result.dataSources).toHaveLength(1);
      expect(mockFs.readFile).toHaveBeenCalledWith(testConfigPath, 'utf-8');
    });

    it('should create default configuration when file does not exist', async () => {
      mockFs.access.mockRejectedValue(new Error('File not found'));
      mockFs.mkdir.mockResolvedValue(undefined);
      mockFs.writeFile.mockResolvedValue(undefined);

      const result = await configManager.loadConfiguration();

      expect(result.version).toBe('1.0.0');
      expect(result.dataSources).toHaveLength(1);
      expect(result.dataSources[0].type).toBe('git');
      expect(mockFs.writeFile).toHaveBeenCalled();
    });

    it('should throw error for invalid JSON', async () => {
      mockFs.access.mockResolvedValue(undefined);
      mockFs.readFile.mockResolvedValue('invalid json');

      await expect(configManager.loadConfiguration()).rejects.toThrow('Invalid JSON in configuration file');
    });

    it('should throw error for invalid configuration when validation enabled', async () => {
      const invalidConfig = {
        version: '1.0.0',
        lastUpdated: new Date(),
        dataSources: [], // Empty data sources should cause validation error
        aiConfig: {
          provider: 'openai',
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
        reportTypes: []
      };

      mockFs.access.mockResolvedValue(undefined);
      mockFs.readFile.mockResolvedValue(JSON.stringify(invalidConfig));

      await expect(configManager.loadConfiguration()).rejects.toThrow('Invalid configuration');
    });

    it('should not create default config when createIfMissing is false', async () => {
      const configManagerNoCreate = new ConfigurationManager({
        configPath: testConfigPath,
        createIfMissing: false
      });

      mockFs.access.mockRejectedValue(new Error('File not found'));

      await expect(configManagerNoCreate.loadConfiguration()).rejects.toThrow('Configuration file not found');
    });
  });

  describe('saveConfiguration', () => {
    it('should save valid configuration to file', async () => {
      const validConfig: SystemConfig = {
        version: '1.0.0',
        lastUpdated: new Date(),
        dataSources: [{
          type: 'git',
          enabled: true,
          name: 'test-repo',
          repositories: [{
            name: 'test',
            path: '/test/path'
          }]
        }],
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

      mockFs.mkdir.mockResolvedValue(undefined);
      mockFs.writeFile.mockResolvedValue(undefined);

      await configManager.saveConfiguration(validConfig);

      expect(mockFs.mkdir).toHaveBeenCalledWith(path.dirname(testConfigPath), { recursive: true });
      expect(mockFs.writeFile).toHaveBeenCalledWith(
        testConfigPath,
        expect.stringContaining('"version": "1.0.0"'),
        'utf-8'
      );
    });

    it('should throw error for invalid configuration', async () => {
      const invalidConfig = {
        version: '1.0.0',
        lastUpdated: new Date(),
        dataSources: [], // Empty data sources should cause validation error
        aiConfig: {
          provider: 'openai',
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
        reportTypes: []
      } as SystemConfig;

      await expect(configManager.saveConfiguration(invalidConfig)).rejects.toThrow('Cannot save invalid configuration');
    });

    it('should update lastUpdated timestamp when saving', async () => {
      const validConfig: SystemConfig = {
        version: '1.0.0',
        lastUpdated: new Date('2020-01-01'), // Old date
        dataSources: [{
          type: 'git',
          enabled: true,
          name: 'test-repo',
          repositories: [{
            name: 'test',
            path: '/test/path'
          }]
        }],
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

      mockFs.mkdir.mockResolvedValue(undefined);
      mockFs.writeFile.mockResolvedValue(undefined);

      const originalDate = validConfig.lastUpdated;
      await configManager.saveConfiguration(validConfig);

      // lastUpdated should be updated to current time
      expect(validConfig.lastUpdated.getTime()).toBeGreaterThan(originalDate.getTime());
    });
  });

  describe('updateConfiguration', () => {
    it('should update specific configuration sections', async () => {
      const existingConfig: SystemConfig = {
        version: '1.0.0',
        lastUpdated: new Date(),
        dataSources: [{
          type: 'git',
          enabled: true,
          name: 'test-repo',
          repositories: [{
            name: 'test',
            path: '/test/path'
          }]
        }],
        aiConfig: {
          provider: 'openai',
          apiKey: 'old-key',
          model: 'gpt-3.5-turbo',
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

      // Mock loading existing config
      mockFs.access.mockResolvedValue(undefined);
      mockFs.readFile.mockResolvedValue(JSON.stringify(existingConfig));
      mockFs.mkdir.mockResolvedValue(undefined);
      mockFs.writeFile.mockResolvedValue(undefined);

      const updates = {
        aiConfig: {
          ...existingConfig.aiConfig,
          apiKey: 'new-key',
          model: 'gpt-4'
        }
      };

      const result = await configManager.updateConfiguration(updates);

      expect(result.aiConfig.apiKey).toBe('new-key');
      expect(result.aiConfig.model).toBe('gpt-4');
      expect(result.version).toBe('1.0.0'); // Other fields preserved
    });
  });

  describe('validateConfigurationFile', () => {
    it('should return validation result for valid configuration', async () => {
      const validConfig: SystemConfig = {
        version: '1.0.0',
        lastUpdated: new Date(),
        dataSources: [{
          type: 'git',
          enabled: true,
          name: 'test-repo',
          repositories: [{
            name: 'test',
            path: '/test/path'
          }]
        }],
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

      mockFs.access.mockResolvedValue(undefined);
      mockFs.readFile.mockResolvedValue(JSON.stringify(validConfig));

      const result = await configManager.validateConfigurationFile();

      expect(result.isValid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should return validation errors for invalid configuration', async () => {
      mockFs.access.mockResolvedValue(undefined);
      mockFs.readFile.mockResolvedValue('invalid json');

      const result = await configManager.validateConfigurationFile();

      expect(result.isValid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
    });
  });

  describe('backupConfiguration', () => {
    it('should create backup of configuration file', async () => {
      mockFs.copyFile.mockResolvedValue(undefined);

      const backupPath = await configManager.backupConfiguration();

      expect(backupPath).toContain('.backup.');
      expect(mockFs.copyFile).toHaveBeenCalledWith(testConfigPath, backupPath);
    });

    it('should throw error if backup fails', async () => {
      mockFs.copyFile.mockRejectedValue(new Error('Copy failed'));

      await expect(configManager.backupConfiguration()).rejects.toThrow('Failed to create configuration backup');
    });
  });

  describe('restoreConfiguration', () => {
    it('should restore configuration from backup', async () => {
      const backupPath = './test-config.json.backup.2024-01-01';
      mockFs.copyFile.mockResolvedValue(undefined);

      await configManager.restoreConfiguration(backupPath);

      expect(mockFs.copyFile).toHaveBeenCalledWith(backupPath, testConfigPath);
    });

    it('should throw error if restore fails', async () => {
      const backupPath = './test-config.json.backup.2024-01-01';
      mockFs.copyFile.mockRejectedValue(new Error('Copy failed'));

      await expect(configManager.restoreConfiguration(backupPath)).rejects.toThrow('Failed to restore configuration from backup');
    });
  });

  describe('configFileExists', () => {
    it('should return true when config file exists', async () => {
      mockFs.access.mockResolvedValue(undefined);

      const exists = await configManager.configFileExists();

      expect(exists).toBe(true);
    });

    it('should return false when config file does not exist', async () => {
      mockFs.access.mockRejectedValue(new Error('File not found'));

      const exists = await configManager.configFileExists();

      expect(exists).toBe(false);
    });
  });

  describe('getConfigPath', () => {
    it('should return the configuration file path', () => {
      const path = configManager.getConfigPath();
      expect(path).toBe(testConfigPath);
    });
  });

  describe('sanitizeAndSaveConfiguration', () => {
    it('should sanitize and save configuration with whitespace trimming', async () => {
      const dirtyConfig: SystemConfig = {
        version: '  1.0.0  ',
        lastUpdated: new Date(),
        dataSources: [{
          type: 'git',
          enabled: true,
          name: '  test-repo  ',
          repositories: [{
            name: '  repo  ',
            path: '  /path  '
          }]
        }],
        aiConfig: {
          provider: 'openai',
          apiKey: '  sk-test-key  ',
          model: '  gpt-4  ',
          customPrompts: {
            daily: 'Daily prompt',
            weekly: 'Weekly prompt',
            monthly: 'Monthly prompt'
          }
        },
        outputConfig: {
          format: 'markdown',
          outputPath: '  ./reports  ',
          includeMetadata: true
        },
        reportTypes: [{
          type: 'daily',
          enabled: true
        }]
      };

      mockFs.mkdir.mockResolvedValue(undefined);
      mockFs.writeFile.mockResolvedValue(undefined);

      const result = await configManager.sanitizeAndSaveConfiguration(dirtyConfig);

      expect(result.version).toBe('1.0.0');
      expect(result.dataSources[0].name).toBe('test-repo');
      expect(result.aiConfig.apiKey).toBe('sk-test-key');
      expect(result.outputConfig.outputPath).toBe('./reports');
      expect(mockFs.writeFile).toHaveBeenCalled();
    });

    it('should throw error if sanitized configuration is still invalid', async () => {
      const invalidConfig = {
        version: '1.0.0',
        lastUpdated: new Date(),
        dataSources: [], // This will cause validation error
        aiConfig: {
          provider: 'openai',
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
        reportTypes: []
      } as SystemConfig;

      await expect(configManager.sanitizeAndSaveConfiguration(invalidConfig)).rejects.toThrow('Failed to sanitize and save configuration');
    });
  });

  describe('createEnhancedDefaultConfiguration', () => {
    it('should create enhanced default configuration with preferences', () => {
      const config = configManager.createEnhancedDefaultConfiguration({
        preferredProvider: 'anthropic',
        preferredFormat: 'html',
        enableAllReportTypes: true,
        customOutputPath: '/custom/output'
      });

      expect(config.aiConfig.provider).toBe('anthropic');
      expect(config.aiConfig.model).toBe('claude-3-sonnet');
      expect(config.outputConfig.format).toBe('html');
      expect(config.outputConfig.outputPath).toBe('/custom/output');
      expect(config.reportTypes.every(rt => rt.enabled)).toBe(true);
    });

    it('should create default configuration without preferences', () => {
      const config = configManager.createEnhancedDefaultConfiguration();

      expect(config.version).toBe('1.0.0');
      expect(config.dataSources).toHaveLength(1);
      expect(config.aiConfig.provider).toBe('openai');
      expect(config.outputConfig.format).toBe('markdown');
    });
  });

  describe('validateConfigurationCompleteness', () => {
    it('should validate configuration completeness', async () => {
      const incompleteConfig: SystemConfig = {
        version: '1.0.0',
        lastUpdated: new Date(),
        dataSources: [{
          type: 'git',
          enabled: false, // Disabled data source
          name: 'test-repo',
          repositories: [{
            name: 'test',
            path: '/test/path'
          }]
        }],
        aiConfig: {
          provider: 'openai',
          apiKey: '', // Empty API key
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
          enabled: false // Disabled report type
        }]
      };

      mockFs.access.mockResolvedValue(undefined);
      mockFs.readFile.mockResolvedValue(JSON.stringify(incompleteConfig));

      const result = await configManager.validateConfigurationCompleteness();

      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('No data sources are enabled. Enable at least one data source to generate reports');
      expect(result.errors).toContain('AI provider "openai" requires an API key. Please configure your API key before generating reports');
      expect(result.warnings).toContain('No report types are enabled. Enable at least one report type (daily, weekly, or monthly) to generate reports');
    });
  });

  describe('validateConfigurationEdgeCases', () => {
    it('should detect edge cases in configuration', async () => {
      const edgeCaseConfig: SystemConfig = {
        version: 'v1.0', // Non-semantic version
        lastUpdated: new Date(Date.now() + 86400000), // Future date
        dataSources: [
          {
            type: 'git',
            enabled: true,
            name: 'duplicate-name',
            repositories: [{ name: 'repo1', path: '/path1' }]
          },
          {
            type: 'git',
            enabled: true,
            name: 'duplicate-name', // Duplicate name
            repositories: [{ name: 'repo2', path: '/path2' }]
          }
        ],
        aiConfig: {
          provider: 'openai',
          apiKey: 'sk-test',
          model: 'gpt-4',
          timeout: 60000,
          maxRetries: 15, // Excessive retries
          customPrompts: { daily: 'test', weekly: 'test', monthly: 'test' }
        },
        outputConfig: {
          format: 'markdown',
          outputPath: './reports',
          includeMetadata: true
        },
        reportTypes: [{ type: 'daily', enabled: true }]
      };

      mockFs.access.mockResolvedValue(undefined);
      mockFs.readFile.mockResolvedValue(JSON.stringify(edgeCaseConfig));

      const result = await configManager.validateConfigurationEdgeCases();

      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('Duplicate data source names found: duplicate-name. Each data source must have a unique name');
      expect(result.warnings).toContain('Version "v1.0" does not follow semantic versioning (e.g., "1.0.0"). Consider using standard version format');
      expect(result.warnings).toContain('Configuration lastUpdated timestamp is in the future. This may indicate a clock synchronization issue');
    });
  });
});