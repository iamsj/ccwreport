import { simpleGit, SimpleGit, LogResult, DefaultLogFields, CleanOptions } from 'simple-git';
import { GitCommit, TimeRange, GitRepository, GitCredentials } from '../models/config';

export interface GitCommandOptions {
  author?: string;
  since?: Date;
  until?: Date;
  maxCount?: number;
}

export class GitCommandInterface {
  private git: SimpleGit;
  private repository: GitRepository;

  constructor(repoPath: string, repository?: GitRepository) {
    this.git = simpleGit(repoPath);
    this.repository = repository || {
      name: 'default',
      path: repoPath,
    };
  }

  /**
   * Get git log with specified options and parse into GitCommit objects
   */
  async getCommits(options: GitCommandOptions = {}): Promise<GitCommit[]> {
    try {
      const logOptions: any = {};

      if (options.author) {
        logOptions.author = options.author;
      }
      
      if (options.since) {
        logOptions.since = options.since.toISOString();
      }
      
      if (options.until) {
        logOptions.until = options.until.toISOString();
      }
      
      if (options.maxCount) {
        logOptions.maxCount = options.maxCount;
      }

      // Get log with file statistics
      const logResult: LogResult<DefaultLogFields> = await this.git.log({
        ...logOptions,
        '--stat': null, // Include file statistics
        '--numstat': null, // Include numerical statistics
      });

      return this.parseCommits(logResult);
    } catch (error) {
      throw new Error(`Failed to get git commits: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Get commits for a specific time range
   */
  async getCommitsForTimeRange(timeRange: TimeRange, author?: string): Promise<GitCommit[]> {
    return this.getCommits({
      author,
      since: timeRange.start,
      until: timeRange.end,
    });
  }

  /**
   * Check if the repository exists and is accessible
   */
  async validateRepository(): Promise<boolean> {
    try {
      await this.git.status();
      return true;
    } catch (error) {
      return false;
    }
  }

  /**
   * Get repository information
   */
  async getRepositoryInfo(): Promise<{ branch: string; remote?: string }> {
    try {
      const status = await this.git.status();
      const remotes = await this.git.getRemotes(true);
      
      return {
        branch: status.current || 'unknown',
        remote: remotes.length > 0 ? remotes[0].refs.fetch : undefined,
      };
    } catch (error) {
      throw new Error(`Failed to get repository info: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Parse git log result into GitCommit objects
   */
  private parseCommits(logResult: LogResult<DefaultLogFields>): GitCommit[] {
    return logResult.all.map(commit => {
      // Parse file changes from diff stats
      const filesChanged: string[] = [];
      let additions = 0;
      let deletions = 0;

      // Extract file statistics if available
      if (commit.diff && commit.diff.files) {
        commit.diff.files.forEach(file => {
          filesChanged.push(file.file);
          additions += file.insertions || 0;
          deletions += file.deletions || 0;
        });
      }

      return {
        hash: commit.hash,
        author: commit.author_name,
        date: new Date(commit.date),
        message: commit.message,
        filesChanged,
        additions,
        deletions,
      };
    });
  }

  /**
   * Configure authentication for remote repository access
   */
  async configureAuthentication(credentials: GitCredentials): Promise<void> {
    try {
      if (this.repository.remote) {
        // Parse the remote URL to inject credentials
        const authenticatedUrl = this.buildAuthenticatedUrl(this.repository.remote, credentials);
        
        // Set the remote URL with authentication
        await this.git.remote(['set-url', 'origin', authenticatedUrl]);
      }
    } catch (error) {
      throw new Error(`Failed to configure authentication: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Clone a remote repository with authentication
   */
  async cloneRepository(targetPath: string, credentials?: GitCredentials): Promise<void> {
    try {
      if (!this.repository.remote) {
        throw new Error('No remote URL specified for cloning');
      }

      let cloneUrl = this.repository.remote;
      
      if (credentials) {
        cloneUrl = this.buildAuthenticatedUrl(this.repository.remote, credentials);
      }

      await this.git.clone(cloneUrl, targetPath, {
        '--branch': this.repository.branch || 'main',
        '--single-branch': null,
      });
    } catch (error) {
      throw new Error(`Failed to clone repository: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Fetch latest changes from remote repository
   */
  async fetchRemote(credentials?: GitCredentials): Promise<void> {
    try {
      if (credentials) {
        await this.configureAuthentication(credentials);
      }

      await this.git.fetch('origin', this.repository.branch || 'main');
    } catch (error) {
      throw new Error(`Failed to fetch from remote: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Test connection to remote repository
   */
  async testRemoteConnection(credentials?: GitCredentials): Promise<boolean> {
    try {
      if (!this.repository.remote) {
        return false;
      }

      if (credentials) {
        await this.configureAuthentication(credentials);
      }

      // Try to fetch without actually downloading
      await this.git.raw(['ls-remote', '--heads', 'origin']);
      return true;
    } catch (error) {
      return false;
    }
  }

  /**
   * Get the current repository configuration
   */
  getRepository(): GitRepository {
    return { ...this.repository };
  }

  /**
   * Update repository configuration
   */
  updateRepository(repository: Partial<GitRepository>): void {
    this.repository = { ...this.repository, ...repository };
  }

  /**
   * Build authenticated URL for git operations
   */
  private buildAuthenticatedUrl(remoteUrl: string, credentials: GitCredentials): string {
    try {
      const url = new URL(remoteUrl);
      
      // For HTTPS URLs, inject credentials
      if (url.protocol === 'https:') {
        url.username = encodeURIComponent(credentials.username);
        url.password = encodeURIComponent(credentials.token);
        return url.toString();
      }
      
      // For SSH URLs, return as-is (SSH key authentication should be configured separately)
      if (url.protocol === 'ssh:' || remoteUrl.startsWith('git@')) {
        return remoteUrl;
      }
      
      return remoteUrl;
    } catch (error) {
      // If URL parsing fails, return original URL
      return remoteUrl;
    }
  }

  /**
   * Validate repository configuration
   */
  static validateRepositoryConfig(repository: GitRepository): { isValid: boolean; errors: string[] } {
    const errors: string[] = [];

    if (!repository.name || repository.name.trim() === '') {
      errors.push('Repository name is required');
    }

    if (!repository.path || repository.path.trim() === '') {
      errors.push('Repository path is required');
    }

    if (repository.remote) {
      try {
        new URL(repository.remote);
      } catch {
        // Check if it's a valid SSH URL format
        if (!repository.remote.match(/^git@[\w.-]+:[\w.-]+\/[\w.-]+\.git$/)) {
          errors.push('Invalid remote URL format');
        }
      }
    }

    if (repository.credentials) {
      if (!repository.credentials.username || repository.credentials.username.trim() === '') {
        errors.push('Username is required when credentials are provided');
      }
      if (!repository.credentials.token || repository.credentials.token.trim() === '') {
        errors.push('Token is required when credentials are provided');
      }
    }

    return {
      isValid: errors.length === 0,
      errors,
    };
  }

  /**
   * Create a new GitCommandInterface for a repository
   */
  static create(repository: GitRepository): GitCommandInterface {
    return new GitCommandInterface(repository.path, repository);
  }
}