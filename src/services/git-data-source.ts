// Git data source implementation following the pluggable architecture

import {
  DataSource,
  DataSourceConfig,
  DataSourceConfigSchema,
  DataSourceError,
  DataSourceConnectionError,
  DataSourceCollectionError,
} from '../models/data-source';
import {
  TimeRange,
  ValidationResult,
  CollectedData,
  GitDataSourceConfig,
  GitRepository,
} from '../models/config';
import { GitCommandInterface } from './git-command-interface';
import { GitDataProcessor } from './git-data-processor';

/**
 * Git data source implementation for collecting commit data
 */
export class GitDataSource implements DataSource {
  readonly type = 'git';
  readonly name = 'Git Repository Data Source';
  readonly version = '1.0.0';

  /**
   * Collect git commit data for the specified time range
   */
  async collect(config: DataSourceConfig, timeRange: TimeRange): Promise<CollectedData> {
    const gitConfig = config as GitDataSourceConfig;
    
    // Validate configuration
    const validation = this.validate(gitConfig);
    if (!validation.isValid) {
      throw new DataSourceError(
        `Invalid configuration: ${validation.errors.join(', ')}`,
        this.type,
        config.name
      );
    }

    try {
      const allCommits = [];
      const repositoryNames = [];

      // Collect commits from all configured repositories
      for (const repository of gitConfig.repositories) {
        try {
          const commits = await this.collectFromRepository(repository, timeRange, gitConfig);
          allCommits.push(...commits);
          repositoryNames.push(repository.name);
        } catch (error) {
          // Log repository-specific error but continue with other repositories
          const repoError = new DataSourceCollectionError(
            `Failed to collect from repository '${repository.name}': ${error instanceof Error ? error.message : 'Unknown error'}`,
            this.type,
            config.name,
            timeRange,
            error instanceof Error ? error : undefined
          );
          
          // For now, we'll throw the error. In a more sophisticated implementation,
          // we might want to collect errors and return partial results
          throw repoError;
        }
      }

      // Process and filter the collected data
      const processedData = GitDataProcessor.processCommitData(
        allCommits,
        {
          username: gitConfig.username,
          dateRange: timeRange,
          repositories: repositoryNames,
        },
        repositoryNames
      );

      return {
        source: `${this.type}:${config.name}`,
        timeRange,
        data: processedData.commits,
      };
    } catch (error) {
      if (error instanceof DataSourceError) {
        throw error;
      }
      
      throw new DataSourceCollectionError(
        `Git data collection failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
        this.type,
        config.name,
        timeRange,
        error instanceof Error ? error : undefined
      );
    }
  }

  /**
   * Validate git data source configuration
   */
  validate(config: DataSourceConfig): ValidationResult {
    const errors: string[] = [];
    const warnings: string[] = [];

    // Check if config is actually a GitDataSourceConfig
    if (config.type !== 'git') {
      errors.push(`Expected type 'git', got '${config.type}'`);
      return { isValid: false, errors, warnings };
    }

    const gitConfig = config as GitDataSourceConfig;

    // Validate basic properties
    if (!gitConfig.name || gitConfig.name.trim() === '') {
      errors.push('Name is required');
    }

    // Validate repositories
    if (!gitConfig.repositories || gitConfig.repositories.length === 0) {
      errors.push('At least one repository must be configured');
    } else {
      gitConfig.repositories.forEach((repo, index) => {
        const repoValidation = GitCommandInterface.validateRepositoryConfig(repo);
        if (!repoValidation.isValid) {
          errors.push(`Repository ${index + 1} (${repo.name}): ${repoValidation.errors.join(', ')}`);
        }
      });
    }

    // Validate username if provided
    if (gitConfig.username !== undefined && gitConfig.username.trim() === '') {
      warnings.push('Username is empty, will collect commits from all authors');
    }

    // Validate time range if provided
    if (gitConfig.timeRange) {
      const timeRangeValidation = GitDataProcessor.validateDateRange(gitConfig.timeRange);
      if (!timeRangeValidation.isValid) {
        errors.push(`Time range validation failed: ${timeRangeValidation.errors.join(', ')}`);
      }
    }

    return {
      isValid: errors.length === 0,
      errors,
      warnings,
    };
  }

  /**
   * Test connection to git repositories
   */
  async testConnection(config: DataSourceConfig): Promise<boolean> {
    const gitConfig = config as GitDataSourceConfig;
    
    // Validate configuration first
    const validation = this.validate(gitConfig);
    if (!validation.isValid) {
      throw new DataSourceConnectionError(
        `Configuration validation failed: ${validation.errors.join(', ')}`,
        this.type,
        config.name
      );
    }

    try {
      // Test connection to all repositories
      const connectionTests = gitConfig.repositories.map(async (repository) => {
        const gitInterface = GitCommandInterface.create(repository);
        
        // Test local repository access
        const isValid = await gitInterface.validateRepository();
        if (!isValid) {
          throw new Error(`Repository '${repository.name}' is not accessible`);
        }

        // Test remote connection if configured
        if (repository.remote && repository.credentials) {
          const remoteTest = await gitInterface.testRemoteConnection(repository.credentials);
          if (!remoteTest) {
            throw new Error(`Remote connection failed for repository '${repository.name}'`);
          }
        }

        return true;
      });

      const results = await Promise.allSettled(connectionTests);
      const failures = results.filter(result => result.status === 'rejected');
      
      if (failures.length > 0) {
        const errorMessages = failures.map(failure => 
          failure.status === 'rejected' ? failure.reason.message : 'Unknown error'
        );
        throw new Error(`Connection test failed: ${errorMessages.join('; ')}`);
      }

      return true;
    } catch (error) {
      throw new DataSourceConnectionError(
        `Git connection test failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
        this.type,
        config.name,
        error instanceof Error ? error : undefined
      );
    }
  }

  /**
   * Get configuration schema for git data source
   */
  getConfigSchema(): DataSourceConfigSchema {
    return {
      $schema: 'http://json-schema.org/draft-07/schema#',
      type: 'object',
      required: ['type', 'enabled', 'name', 'repositories'],
      properties: {
        type: {
          type: 'string',
          const: 'git',
          description: 'Data source type identifier',
        },
        enabled: {
          type: 'boolean',
          description: 'Whether this data source is enabled',
        },
        name: {
          type: 'string',
          minLength: 1,
          description: 'Human-readable name for this configuration',
        },
        description: {
          type: 'string',
          description: 'Optional description of this data source',
        },
        priority: {
          type: 'number',
          minimum: 0,
          description: 'Priority for data collection (higher = more important)',
        },
        timeout: {
          type: 'number',
          minimum: 1000,
          description: 'Timeout in milliseconds for operations',
        },
        maxRetries: {
          type: 'number',
          minimum: 0,
          maximum: 10,
          description: 'Maximum number of retries for failed operations',
        },
        repositories: {
          type: 'array',
          minItems: 1,
          items: {
            type: 'object',
            required: ['name', 'path'],
            properties: {
              name: {
                type: 'string',
                minLength: 1,
                description: 'Repository name',
              },
              path: {
                type: 'string',
                minLength: 1,
                description: 'Local path to the repository',
              },
              remote: {
                type: 'string',
                description: 'Remote repository URL',
              },
              branch: {
                type: 'string',
                description: 'Branch to analyze',
              },
              credentials: {
                type: 'object',
                required: ['username', 'token'],
                properties: {
                  username: {
                    type: 'string',
                    minLength: 1,
                    description: 'Username for authentication',
                  },
                  token: {
                    type: 'string',
                    minLength: 1,
                    description: 'Personal access token or password',
                  },
                },
                description: 'Authentication credentials for remote access',
              },
            },
          },
          description: 'List of git repositories to analyze',
        },
        username: {
          type: 'string',
          description: 'Filter commits by this username/author',
        },
        timeRange: {
          type: 'object',
          required: ['start', 'end', 'type'],
          properties: {
            start: {
              type: 'string',
              format: 'date-time',
              description: 'Start date for data collection',
            },
            end: {
              type: 'string',
              format: 'date-time',
              description: 'End date for data collection',
            },
            type: {
              type: 'string',
              enum: ['daily', 'weekly', 'monthly'],
              description: 'Type of time range',
            },
          },
          description: 'Time range for data collection',
        },
      },
      additionalProperties: false,
    };
  }

  /**
   * Collect commits from a single repository
   */
  private async collectFromRepository(
    repository: GitRepository,
    timeRange: TimeRange,
    config: GitDataSourceConfig
  ): Promise<import('../models/config').GitCommit[]> {
    const gitInterface = GitCommandInterface.create(repository);

    // Validate repository access
    const isValid = await gitInterface.validateRepository();
    if (!isValid) {
      throw new Error(`Repository '${repository.name}' is not accessible at path: ${repository.path}`);
    }

    // Fetch remote changes if configured
    if (repository.remote && repository.credentials) {
      try {
        await gitInterface.fetchRemote(repository.credentials);
      } catch (error) {
        // Log warning but continue - we might still have local commits
        console.warn(`Failed to fetch remote for repository '${repository.name}': ${error instanceof Error ? error.message : 'Unknown error'}`);
      }
    }

    // Get commits for the time range
    const commits = await gitInterface.getCommitsForTimeRange(timeRange, config.username);

    // Sanitize commit data to handle edge cases
    return GitDataProcessor.sanitizeCommitData(commits);
  }

  /**
   * Create a new GitDataSource instance
   */
  static create(): GitDataSource {
    return new GitDataSource();
  }

  /**
   * Create a sample configuration for testing
   */
  static createSampleConfig(name: string = 'sample-git-source'): GitDataSourceConfig {
    return {
      type: 'git',
      enabled: true,
      name,
      description: 'Sample git data source configuration',
      repositories: [
        {
          name: 'sample-repo',
          path: './sample-repo',
          branch: 'main',
        },
      ],
      username: 'sample-user',
      priority: 1,
      timeout: 30000,
      maxRetries: 3,
    };
  }

  /**
   * Validate and normalize a git configuration
   */
  static normalizeConfig(config: Partial<GitDataSourceConfig>): GitDataSourceConfig {
    const normalized: GitDataSourceConfig = {
      type: 'git',
      enabled: config.enabled ?? true,
      name: config.name || 'git-source',
      description: config.description,
      repositories: config.repositories || [],
      username: config.username,
      timeRange: config.timeRange,
      priority: config.priority ?? 1,
      timeout: config.timeout ?? 30000,
      maxRetries: config.maxRetries ?? 3,
    };

    return normalized;
  }
}