import { GitCommandInterface } from './git-command-interface';
import { GitRepository, GitCredentials, CollectedData, TimeRange, GitCommit } from '../models/config';

export interface RepositoryOperationResult {
  repository: string;
  success: boolean;
  data?: GitCommit[];
  error?: string;
}

export class GitRepositoryManager {
  private repositories: Map<string, GitCommandInterface> = new Map();

  /**
   * Add a repository to the manager
   */
  addRepository(repository: GitRepository): void {
    const validation = GitCommandInterface.validateRepositoryConfig(repository);
    if (!validation.isValid) {
      throw new Error(`Invalid repository configuration: ${validation.errors.join(', ')}`);
    }

    const gitInterface = GitCommandInterface.create(repository);
    this.repositories.set(repository.name, gitInterface);
  }

  /**
   * Remove a repository from the manager
   */
  removeRepository(repositoryName: string): boolean {
    return this.repositories.delete(repositoryName);
  }

  /**
   * Get a repository interface by name
   */
  getRepository(repositoryName: string): GitCommandInterface | undefined {
    return this.repositories.get(repositoryName);
  }

  /**
   * Get all repository names
   */
  getRepositoryNames(): string[] {
    return Array.from(this.repositories.keys());
  }

  /**
   * Validate all repositories
   */
  async validateAllRepositories(): Promise<Map<string, boolean>> {
    const results = new Map<string, boolean>();
    
    for (const [name, gitInterface] of this.repositories) {
      try {
        const isValid = await gitInterface.validateRepository();
        results.set(name, isValid);
      } catch (error) {
        results.set(name, false);
      }
    }

    return results;
  }

  /**
   * Test remote connections for all repositories
   */
  async testAllRemoteConnections(): Promise<Map<string, boolean>> {
    const results = new Map<string, boolean>();
    
    for (const [name, gitInterface] of this.repositories) {
      try {
        const repository = gitInterface.getRepository();
        const canConnect = await gitInterface.testRemoteConnection(repository.credentials);
        results.set(name, canConnect);
      } catch (error) {
        results.set(name, false);
      }
    }

    return results;
  }

  /**
   * Collect data from all repositories for a given time range
   */
  async collectDataFromAllRepositories(
    timeRange: TimeRange,
    author?: string
  ): Promise<RepositoryOperationResult[]> {
    const results: RepositoryOperationResult[] = [];
    
    // Process repositories concurrently for better performance
    const promises = Array.from(this.repositories.entries()).map(async ([name, gitInterface]) => {
      try {
        const repository = gitInterface.getRepository();
        
        // Fetch remote changes if credentials are available
        if (repository.remote && repository.credentials) {
          try {
            await gitInterface.fetchRemote(repository.credentials);
          } catch (fetchError) {
            // Continue even if fetch fails - we can still get local commits
            console.warn(`Failed to fetch from remote for ${name}: ${fetchError}`);
          }
        }

        const commits = await gitInterface.getCommitsForTimeRange(timeRange, author);
        
        return {
          repository: name,
          success: true,
          data: commits,
        };
      } catch (error) {
        return {
          repository: name,
          success: false,
          error: error instanceof Error ? error.message : 'Unknown error',
        };
      }
    });

    const resolvedResults = await Promise.all(promises);
    results.push(...resolvedResults);

    return results;
  }

  /**
   * Collect data from specific repositories
   */
  async collectDataFromRepositories(
    repositoryNames: string[],
    timeRange: TimeRange,
    author?: string
  ): Promise<RepositoryOperationResult[]> {
    const results: RepositoryOperationResult[] = [];
    
    for (const name of repositoryNames) {
      const gitInterface = this.repositories.get(name);
      
      if (!gitInterface) {
        results.push({
          repository: name,
          success: false,
          error: `Repository '${name}' not found`,
        });
        continue;
      }

      try {
        const repository = gitInterface.getRepository();
        
        // Fetch remote changes if credentials are available
        if (repository.remote && repository.credentials) {
          try {
            await gitInterface.fetchRemote(repository.credentials);
          } catch (fetchError) {
            console.warn(`Failed to fetch from remote for ${name}: ${fetchError}`);
          }
        }

        const commits = await gitInterface.getCommitsForTimeRange(timeRange, author);
        
        results.push({
          repository: name,
          success: true,
          data: commits,
        });
      } catch (error) {
        results.push({
          repository: name,
          success: false,
          error: error instanceof Error ? error.message : 'Unknown error',
        });
      }
    }

    return results;
  }

  /**
   * Convert repository operation results to CollectedData format
   */
  convertToCollectedData(results: RepositoryOperationResult[], timeRange: TimeRange): CollectedData[] {
    return results
      .filter(result => result.success && result.data)
      .map(result => ({
        source: `git:${result.repository}`,
        timeRange,
        data: result.data!,
      }));
  }

  /**
   * Get summary of all repositories
   */
  async getRepositoriesSummary(): Promise<Array<{
    name: string;
    path: string;
    remote?: string;
    branch?: string;
    isValid: boolean;
    canConnectToRemote: boolean;
    hasCredentials: boolean;
  }>> {
    const summary = [];
    
    for (const [name, gitInterface] of this.repositories) {
      const repository = gitInterface.getRepository();
      
      try {
        const isValid = await gitInterface.validateRepository();
        const canConnectToRemote = repository.remote 
          ? await gitInterface.testRemoteConnection(repository.credentials)
          : false;
        
        const repoInfo = await gitInterface.getRepositoryInfo();
        
        summary.push({
          name,
          path: repository.path,
          remote: repository.remote,
          branch: repoInfo.branch,
          isValid,
          canConnectToRemote,
          hasCredentials: !!repository.credentials,
        });
      } catch (error) {
        summary.push({
          name,
          path: repository.path,
          remote: repository.remote,
          branch: 'unknown',
          isValid: false,
          canConnectToRemote: false,
          hasCredentials: !!repository.credentials,
        });
      }
    }

    return summary;
  }

  /**
   * Clear all repositories
   */
  clear(): void {
    this.repositories.clear();
  }

  /**
   * Get the number of managed repositories
   */
  size(): number {
    return this.repositories.size;
  }
}