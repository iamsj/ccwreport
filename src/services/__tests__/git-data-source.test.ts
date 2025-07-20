// Unit tests for GitDataSource

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { GitDataSource } from '../git-data-source';
import { GitCommandInterface } from '../git-command-interface';
import { GitDataProcessor } from '../git-data-processor';
import {
  GitDataSourceConfig,
  TimeRange,
  GitRepository,
  GitCommit,
} from '../../models/config';
import {
  DataSourceConnectionError,
  DataSourceCollectionError,
} from '../../models/data-source';

// Mock the GitCommandInterface
vi.mock('../git-command-interface');
vi.mock('../git-data-processor');

const MockedGitCommandInterface = vi.mocked(GitCommandInterface);
const MockedGitDataProcessor = vi.mocked(GitDataProcessor);

describe('GitDataSource', () => {
  let gitDataSource: GitDataSource;
  let mockGitInterface: any;
  let sampleConfig: GitDataSourceConfig;
  let sampleTimeRange: TimeRange;
  let sampleCommits: GitCommit[];

  beforeEach(() => {
    gitDataSource = new GitDataSource();
    
    // Create mock git interface
    mockGitInterface = {
      validateRepository: vi.fn(),
      fetchRemote: vi.fn(),
      getCommitsForTimeRange: vi.fn(),
      testRemoteConnection: vi.fn(),
    };

    // Setup sample data
    sampleConfig = {
      type: 'git',
      enabled: true,
      name: 'test-git-source',
      repositories: [
        {
          name: 'test-repo',
          path: './test-repo',
          branch: 'main',
        },
      ],
      username: 'test-user',
    };

    sampleTimeRange = {
      start: new Date('2024-01-01'),
      end: new Date('2024-01-02'),
      type: 'daily',
    };

    sampleCommits = [
      {
        hash: 'abc123',
        author: 'test-user',
        date: new Date('2024-01-01T10:00:00Z'),
        message: 'Test commit',
        filesChanged: ['file1.ts'],
        additions: 10,
        deletions: 5,
      },
    ];

    // Setup mocks
    MockedGitCommandInterface.create.mockReturnValue(mockGitInterface);
    MockedGitCommandInterface.validateRepositoryConfig.mockReturnValue({
      isValid: true,
      errors: [],
    });
    
    MockedGitDataProcessor.validateDateRange.mockReturnValue({
      isValid: true,
      errors: [],
    });
    
    MockedGitDataProcessor.processCommitData.mockReturnValue({
      commits: sampleCommits,
      summary: {
        totalCommits: 1,
        totalAdditions: 10,
        totalDeletions: 5,
        totalFilesChanged: 1,
        dateRange: sampleTimeRange,
        repositories: ['test-repo'],
        authors: ['test-user'],
      },
      metadata: {
        processedAt: new Date(),
        filter: {},
        hasMoreData: false,
      },
    });
    
    MockedGitDataProcessor.sanitizeCommitData.mockReturnValue(sampleCommits);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('Basic Properties', () => {
    it('should have correct type and metadata', () => {
      expect(gitDataSource.type).toBe('git');
      expect(gitDataSource.name).toBe('Git Repository Data Source');
      expect(gitDataSource.version).toBe('1.0.0');
    });
  });

  describe('Configuration Validation', () => {
    it('should validate correct configuration', () => {
      const result = gitDataSource.validate(sampleConfig);
      
      expect(result.isValid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should reject configuration with wrong type', () => {
      const invalidConfig = { ...sampleConfig, type: 'invalid' };
      
      const result = gitDataSource.validate(invalidConfig);
      
      expect(result.isValid).toBe(false);
      expect(result.errors).toContain("Expected type 'git', got 'invalid'");
    });

    it('should reject configuration without name', () => {
      const invalidConfig = { ...sampleConfig, name: '' };
      
      const result = gitDataSource.validate(invalidConfig);
      
      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('Name is required');
    });

    it('should reject configuration without repositories', () => {
      const invalidConfig = { ...sampleConfig, repositories: [] };
      
      const result = gitDataSource.validate(invalidConfig);
      
      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('At least one repository must be configured');
    });

    it('should validate repository configurations', () => {
      MockedGitCommandInterface.validateRepositoryConfig.mockReturnValue({
        isValid: false,
        errors: ['Invalid repository path'],
      });

      const result = gitDataSource.validate(sampleConfig);
      
      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('Repository 1 (test-repo): Invalid repository path');
    });

    it('should validate time range if provided', () => {
      const configWithTimeRange = {
        ...sampleConfig,
        timeRange: sampleTimeRange,
      };

      MockedGitDataProcessor.validateDateRange.mockReturnValue({
        isValid: false,
        errors: ['Invalid date range'],
      });

      const result = gitDataSource.validate(configWithTimeRange);
      
      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('Time range validation failed: Invalid date range');
    });

    it('should provide warnings for empty username', () => {
      const configWithEmptyUsername = { ...sampleConfig, username: '' };
      
      const result = gitDataSource.validate(configWithEmptyUsername);
      
      expect(result.isValid).toBe(true);
      expect(result.warnings).toContain('Username is empty, will collect commits from all authors');
    });
  });

  describe('Connection Testing', () => {
    it('should test connection successfully', async () => {
      mockGitInterface.validateRepository.mockResolvedValue(true);
      
      const result = await gitDataSource.testConnection(sampleConfig);
      
      expect(result).toBe(true);
      expect(MockedGitCommandInterface.create).toHaveBeenCalledWith(sampleConfig.repositories[0]);
      expect(mockGitInterface.validateRepository).toHaveBeenCalled();
    });

    it('should test remote connection when configured', async () => {
      const configWithRemote = {
        ...sampleConfig,
        repositories: [
          {
            ...sampleConfig.repositories[0],
            remote: 'https://github.com/user/repo.git',
            credentials: {
              username: 'user',
              token: 'token',
            },
          },
        ],
      };

      mockGitInterface.validateRepository.mockResolvedValue(true);
      mockGitInterface.testRemoteConnection.mockResolvedValue(true);
      
      const result = await gitDataSource.testConnection(configWithRemote);
      
      expect(result).toBe(true);
      expect(mockGitInterface.testRemoteConnection).toHaveBeenCalledWith({
        username: 'user',
        token: 'token',
      });
    });

    it('should handle repository validation failure', async () => {
      mockGitInterface.validateRepository.mockResolvedValue(false);
      
      await expect(gitDataSource.testConnection(sampleConfig))
        .rejects.toThrow(DataSourceConnectionError);
    });

    it('should handle remote connection failure', async () => {
      const configWithRemote = {
        ...sampleConfig,
        repositories: [
          {
            ...sampleConfig.repositories[0],
            remote: 'https://github.com/user/repo.git',
            credentials: {
              username: 'user',
              token: 'token',
            },
          },
        ],
      };

      mockGitInterface.validateRepository.mockResolvedValue(true);
      mockGitInterface.testRemoteConnection.mockResolvedValue(false);
      
      await expect(gitDataSource.testConnection(configWithRemote))
        .rejects.toThrow(DataSourceConnectionError);
    });

    it('should handle configuration validation errors during connection test', async () => {
      const invalidConfig = { ...sampleConfig, repositories: [] };
      
      await expect(gitDataSource.testConnection(invalidConfig))
        .rejects.toThrow(DataSourceConnectionError);
    });
  });

  describe('Data Collection', () => {
    beforeEach(() => {
      mockGitInterface.validateRepository.mockResolvedValue(true);
      mockGitInterface.getCommitsForTimeRange.mockResolvedValue(sampleCommits);
    });

    it('should collect data successfully', async () => {
      const result = await gitDataSource.collect(sampleConfig, sampleTimeRange);
      
      expect(result.source).toBe('git:test-git-source');
      expect(result.timeRange).toBe(sampleTimeRange);
      expect(result.data).toBe(sampleCommits);
      
      expect(MockedGitCommandInterface.create).toHaveBeenCalledWith(sampleConfig.repositories[0]);
      expect(mockGitInterface.validateRepository).toHaveBeenCalled();
      expect(mockGitInterface.getCommitsForTimeRange).toHaveBeenCalledWith(
        sampleTimeRange,
        sampleConfig.username
      );
    });

    it('should handle multiple repositories', async () => {
      const multiRepoConfig = {
        ...sampleConfig,
        repositories: [
          sampleConfig.repositories[0],
          {
            name: 'second-repo',
            path: './second-repo',
            branch: 'develop',
          },
        ],
      };

      const result = await gitDataSource.collect(multiRepoConfig, sampleTimeRange);
      
      expect(MockedGitCommandInterface.create).toHaveBeenCalledTimes(2);
      expect(mockGitInterface.validateRepository).toHaveBeenCalledTimes(2);
      expect(mockGitInterface.getCommitsForTimeRange).toHaveBeenCalledTimes(2);
    });

    it('should fetch remote changes when configured', async () => {
      const configWithRemote = {
        ...sampleConfig,
        repositories: [
          {
            ...sampleConfig.repositories[0],
            remote: 'https://github.com/user/repo.git',
            credentials: {
              username: 'user',
              token: 'token',
            },
          },
        ],
      };

      await gitDataSource.collect(configWithRemote, sampleTimeRange);
      
      expect(mockGitInterface.fetchRemote).toHaveBeenCalledWith({
        username: 'user',
        token: 'token',
      });
    });

    it('should continue on fetch failure', async () => {
      const configWithRemote = {
        ...sampleConfig,
        repositories: [
          {
            ...sampleConfig.repositories[0],
            remote: 'https://github.com/user/repo.git',
            credentials: {
              username: 'user',
              token: 'token',
            },
          },
        ],
      };

      mockGitInterface.fetchRemote.mockRejectedValue(new Error('Fetch failed'));
      
      // Should not throw, should continue with local commits
      const result = await gitDataSource.collect(configWithRemote, sampleTimeRange);
      
      expect(result.data).toBe(sampleCommits);
    });

    it('should handle repository validation failure during collection', async () => {
      mockGitInterface.validateRepository.mockResolvedValue(false);
      
      await expect(gitDataSource.collect(sampleConfig, sampleTimeRange))
        .rejects.toThrow(DataSourceCollectionError);
    });

    it('should handle configuration validation failure during collection', async () => {
      const invalidConfig = { ...sampleConfig, repositories: [] };
      
      await expect(gitDataSource.collect(invalidConfig, sampleTimeRange))
        .rejects.toThrow('Invalid configuration');
    });

    it('should sanitize commit data', async () => {
      await gitDataSource.collect(sampleConfig, sampleTimeRange);
      
      expect(MockedGitDataProcessor.sanitizeCommitData).toHaveBeenCalledWith(sampleCommits);
    });

    it('should process commit data with correct filter', async () => {
      await gitDataSource.collect(sampleConfig, sampleTimeRange);
      
      expect(MockedGitDataProcessor.processCommitData).toHaveBeenCalledWith(
        sampleCommits,
        {
          username: sampleConfig.username,
          dateRange: sampleTimeRange,
          repositories: ['test-repo'],
        },
        ['test-repo']
      );
    });
  });

  describe('Configuration Schema', () => {
    it('should provide valid JSON schema', () => {
      const schema = gitDataSource.getConfigSchema();
      
      expect(schema.$schema).toBe('http://json-schema.org/draft-07/schema#');
      expect(schema.type).toBe('object');
      expect(schema.required).toContain('type');
      expect(schema.required).toContain('enabled');
      expect(schema.required).toContain('name');
      expect(schema.required).toContain('repositories');
      expect(schema.properties.type.const).toBe('git');
    });

    it('should have comprehensive property definitions', () => {
      const schema = gitDataSource.getConfigSchema();
      
      expect(schema.properties).toHaveProperty('repositories');
      expect(schema.properties).toHaveProperty('username');
      expect(schema.properties).toHaveProperty('timeRange');
      expect(schema.properties).toHaveProperty('timeout');
      expect(schema.properties).toHaveProperty('maxRetries');
    });
  });

  describe('Static Methods', () => {
    it('should create new instance', () => {
      const instance = GitDataSource.create();
      
      expect(instance).toBeInstanceOf(GitDataSource);
      expect(instance.type).toBe('git');
    });

    it('should create sample configuration', () => {
      const config = GitDataSource.createSampleConfig('my-git-source');
      
      expect(config.type).toBe('git');
      expect(config.enabled).toBe(true);
      expect(config.name).toBe('my-git-source');
      expect(config.repositories).toHaveLength(1);
      expect(config.repositories[0].name).toBe('sample-repo');
    });

    it('should normalize configuration', () => {
      const partialConfig = {
        name: 'test-config',
        repositories: [
          {
            name: 'repo1',
            path: './repo1',
          },
        ],
      };

      const normalized = GitDataSource.normalizeConfig(partialConfig);
      
      expect(normalized.type).toBe('git');
      expect(normalized.enabled).toBe(true);
      expect(normalized.name).toBe('test-config');
      expect(normalized.priority).toBe(1);
      expect(normalized.timeout).toBe(30000);
      expect(normalized.maxRetries).toBe(3);
    });

    it('should preserve provided values during normalization', () => {
      const partialConfig = {
        enabled: false,
        name: 'custom-config',
        repositories: [],
        priority: 5,
        timeout: 60000,
        maxRetries: 1,
      };

      const normalized = GitDataSource.normalizeConfig(partialConfig);
      
      expect(normalized.enabled).toBe(false);
      expect(normalized.priority).toBe(5);
      expect(normalized.timeout).toBe(60000);
      expect(normalized.maxRetries).toBe(1);
    });
  });

  describe('Error Handling', () => {
    it('should wrap generic errors in DataSourceCollectionError', async () => {
      mockGitInterface.validateRepository.mockResolvedValue(true);
      mockGitInterface.getCommitsForTimeRange.mockRejectedValue(new Error('Git command failed'));
      
      await expect(gitDataSource.collect(sampleConfig, sampleTimeRange))
        .rejects.toThrow(DataSourceCollectionError);
    });

    it('should preserve DataSourceError instances', async () => {
      const originalError = new DataSourceCollectionError(
        'Original error',
        'git',
        'test',
        sampleTimeRange
      );
      
      mockGitInterface.validateRepository.mockResolvedValue(true);
      mockGitInterface.getCommitsForTimeRange.mockRejectedValue(originalError);
      
      await expect(gitDataSource.collect(sampleConfig, sampleTimeRange))
        .rejects.toThrow(DataSourceCollectionError);
    });
  });
});