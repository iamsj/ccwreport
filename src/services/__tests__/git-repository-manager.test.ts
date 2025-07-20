import { describe, it, expect, vi, beforeEach } from 'vitest';
import { GitRepositoryManager, RepositoryOperationResult } from '../git-repository-manager';
import { GitCommandInterface } from '../git-command-interface';
import { GitRepository, TimeRange, GitCommit } from '../../models/config';

// Mock GitCommandInterface
vi.mock('../git-command-interface');

describe('GitRepositoryManager', () => {
  let manager: GitRepositoryManager;
  let mockGitInterface: any;

  beforeEach(() => {
    vi.clearAllMocks();
    manager = new GitRepositoryManager();
    
    // Create mock GitCommandInterface
    mockGitInterface = {
      validateRepository: vi.fn(),
      testRemoteConnection: vi.fn(),
      getRepository: vi.fn(),
      getCommitsForTimeRange: vi.fn(),
      fetchRemote: vi.fn(),
      getRepositoryInfo: vi.fn(),
    };

    // Mock the static methods
    (GitCommandInterface.validateRepositoryConfig as any) = vi.fn();
    (GitCommandInterface.create as any) = vi.fn().mockReturnValue(mockGitInterface);
  });

  describe('addRepository', () => {
    it('should add valid repository', () => {
      const repository: GitRepository = {
        name: 'test-repo',
        path: '/test/repo',
        remote: 'https://github.com/user/repo.git',
      };

      (GitCommandInterface.validateRepositoryConfig as any).mockReturnValue({
        isValid: true,
        errors: [],
      });

      manager.addRepository(repository);

      expect(GitCommandInterface.validateRepositoryConfig).toHaveBeenCalledWith(repository);
      expect(GitCommandInterface.create).toHaveBeenCalledWith(repository);
      expect(manager.size()).toBe(1);
    });

    it('should throw error for invalid repository', () => {
      const repository: GitRepository = {
        name: '',
        path: '',
      };

      (GitCommandInterface.validateRepositoryConfig as any).mockReturnValue({
        isValid: false,
        errors: ['Repository name is required', 'Repository path is required'],
      });

      expect(() => manager.addRepository(repository)).toThrow(
        'Invalid repository configuration: Repository name is required, Repository path is required'
      );
    });
  });

  describe('removeRepository', () => {
    it('should remove existing repository', () => {
      const repository: GitRepository = {
        name: 'test-repo',
        path: '/test/repo',
      };

      (GitCommandInterface.validateRepositoryConfig as any).mockReturnValue({
        isValid: true,
        errors: [],
      });

      manager.addRepository(repository);
      expect(manager.size()).toBe(1);

      const removed = manager.removeRepository('test-repo');
      expect(removed).toBe(true);
      expect(manager.size()).toBe(0);
    });

    it('should return false for non-existent repository', () => {
      const removed = manager.removeRepository('non-existent');
      expect(removed).toBe(false);
    });
  });

  describe('getRepository', () => {
    it('should return repository interface', () => {
      const repository: GitRepository = {
        name: 'test-repo',
        path: '/test/repo',
      };

      (GitCommandInterface.validateRepositoryConfig as any).mockReturnValue({
        isValid: true,
        errors: [],
      });

      manager.addRepository(repository);
      const gitInterface = manager.getRepository('test-repo');

      expect(gitInterface).toBe(mockGitInterface);
    });

    it('should return undefined for non-existent repository', () => {
      const gitInterface = manager.getRepository('non-existent');
      expect(gitInterface).toBeUndefined();
    });
  });

  describe('getRepositoryNames', () => {
    it('should return all repository names', () => {
      const repo1: GitRepository = { name: 'repo1', path: '/repo1' };
      const repo2: GitRepository = { name: 'repo2', path: '/repo2' };

      (GitCommandInterface.validateRepositoryConfig as any).mockReturnValue({
        isValid: true,
        errors: [],
      });

      manager.addRepository(repo1);
      manager.addRepository(repo2);

      const names = manager.getRepositoryNames();
      expect(names).toEqual(['repo1', 'repo2']);
    });

    it('should return empty array when no repositories', () => {
      const names = manager.getRepositoryNames();
      expect(names).toEqual([]);
    });
  });

  describe('validateAllRepositories', () => {
    it('should validate all repositories', async () => {
      const repo1: GitRepository = { name: 'repo1', path: '/repo1' };
      const repo2: GitRepository = { name: 'repo2', path: '/repo2' };

      (GitCommandInterface.validateRepositoryConfig as any).mockReturnValue({
        isValid: true,
        errors: [],
      });

      manager.addRepository(repo1);
      manager.addRepository(repo2);

      mockGitInterface.validateRepository
        .mockResolvedValueOnce(true)
        .mockResolvedValueOnce(false);

      const results = await manager.validateAllRepositories();

      expect(results.get('repo1')).toBe(true);
      expect(results.get('repo2')).toBe(false);
    });

    it('should handle validation errors', async () => {
      const repo: GitRepository = { name: 'repo1', path: '/repo1' };

      (GitCommandInterface.validateRepositoryConfig as any).mockReturnValue({
        isValid: true,
        errors: [],
      });

      manager.addRepository(repo);
      mockGitInterface.validateRepository.mockRejectedValue(new Error('Validation failed'));

      const results = await manager.validateAllRepositories();

      expect(results.get('repo1')).toBe(false);
    });
  });

  describe('testAllRemoteConnections', () => {
    it('should test all remote connections', async () => {
      const repo1: GitRepository = {
        name: 'repo1',
        path: '/repo1',
        credentials: { username: 'user', token: 'token' },
      };
      const repo2: GitRepository = { name: 'repo2', path: '/repo2' };

      (GitCommandInterface.validateRepositoryConfig as any).mockReturnValue({
        isValid: true,
        errors: [],
      });

      manager.addRepository(repo1);
      manager.addRepository(repo2);

      mockGitInterface.getRepository
        .mockReturnValueOnce(repo1)
        .mockReturnValueOnce(repo2);

      mockGitInterface.testRemoteConnection
        .mockResolvedValueOnce(true)
        .mockResolvedValueOnce(false);

      const results = await manager.testAllRemoteConnections();

      expect(results.get('repo1')).toBe(true);
      expect(results.get('repo2')).toBe(false);
      expect(mockGitInterface.testRemoteConnection).toHaveBeenCalledWith(repo1.credentials);
      expect(mockGitInterface.testRemoteConnection).toHaveBeenCalledWith(undefined);
    });
  });

  describe('collectDataFromAllRepositories', () => {
    const timeRange: TimeRange = {
      start: new Date('2023-01-01'),
      end: new Date('2023-01-31'),
      type: 'monthly',
    };

    const mockCommits: GitCommit[] = [
      {
        hash: 'abc123',
        author: 'John Doe',
        date: new Date('2023-01-15'),
        message: 'Test commit',
        filesChanged: ['file.txt'],
        additions: 10,
        deletions: 2,
      },
    ];

    it('should collect data from all repositories successfully', async () => {
      const repo1: GitRepository = {
        name: 'repo1',
        path: '/repo1',
        remote: 'https://github.com/user/repo1.git',
        credentials: { username: 'user', token: 'token' },
      };
      const repo2: GitRepository = { name: 'repo2', path: '/repo2' };

      (GitCommandInterface.validateRepositoryConfig as any).mockReturnValue({
        isValid: true,
        errors: [],
      });

      manager.addRepository(repo1);
      manager.addRepository(repo2);

      mockGitInterface.getRepository
        .mockReturnValueOnce(repo1)
        .mockReturnValueOnce(repo2);

      mockGitInterface.fetchRemote.mockResolvedValue(undefined);
      mockGitInterface.getCommitsForTimeRange.mockResolvedValue(mockCommits);

      const results = await manager.collectDataFromAllRepositories(timeRange, 'John Doe');

      expect(results).toHaveLength(2);
      expect(results[0]).toEqual({
        repository: 'repo1',
        success: true,
        data: mockCommits,
      });
      expect(results[1]).toEqual({
        repository: 'repo2',
        success: true,
        data: mockCommits,
      });

      expect(mockGitInterface.fetchRemote).toHaveBeenCalledWith(repo1.credentials);
      expect(mockGitInterface.getCommitsForTimeRange).toHaveBeenCalledWith(timeRange, 'John Doe');
    });

    it('should handle fetch errors gracefully', async () => {
      const repo: GitRepository = {
        name: 'repo1',
        path: '/repo1',
        remote: 'https://github.com/user/repo1.git',
        credentials: { username: 'user', token: 'token' },
      };

      (GitCommandInterface.validateRepositoryConfig as any).mockReturnValue({
        isValid: true,
        errors: [],
      });

      manager.addRepository(repo);
      mockGitInterface.getRepository.mockReturnValue(repo);
      mockGitInterface.fetchRemote.mockRejectedValue(new Error('Fetch failed'));
      mockGitInterface.getCommitsForTimeRange.mockResolvedValue(mockCommits);

      // Mock console.warn to avoid output during tests
      const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

      const results = await manager.collectDataFromAllRepositories(timeRange);

      expect(results[0]).toEqual({
        repository: 'repo1',
        success: true,
        data: mockCommits,
      });

      expect(consoleSpy).toHaveBeenCalledWith(
        'Failed to fetch from remote for repo1: Error: Fetch failed'
      );

      consoleSpy.mockRestore();
    });

    it('should handle commit collection errors', async () => {
      const repo: GitRepository = { name: 'repo1', path: '/repo1' };

      (GitCommandInterface.validateRepositoryConfig as any).mockReturnValue({
        isValid: true,
        errors: [],
      });

      manager.addRepository(repo);
      mockGitInterface.getRepository.mockReturnValue(repo);
      mockGitInterface.getCommitsForTimeRange.mockRejectedValue(new Error('Git log failed'));

      const results = await manager.collectDataFromAllRepositories(timeRange);

      expect(results[0]).toEqual({
        repository: 'repo1',
        success: false,
        error: 'Git log failed',
      });
    });
  });

  describe('collectDataFromRepositories', () => {
    const timeRange: TimeRange = {
      start: new Date('2023-01-01'),
      end: new Date('2023-01-31'),
      type: 'monthly',
    };

    const mockCommits: GitCommit[] = [
      {
        hash: 'abc123',
        author: 'John Doe',
        date: new Date('2023-01-15'),
        message: 'Test commit',
        filesChanged: ['file.txt'],
        additions: 10,
        deletions: 2,
      },
    ];

    it('should collect data from specific repositories', async () => {
      const repo1: GitRepository = { name: 'repo1', path: '/repo1' };
      const repo2: GitRepository = { name: 'repo2', path: '/repo2' };

      (GitCommandInterface.validateRepositoryConfig as any).mockReturnValue({
        isValid: true,
        errors: [],
      });

      manager.addRepository(repo1);
      manager.addRepository(repo2);

      mockGitInterface.getRepository.mockReturnValue(repo1);
      mockGitInterface.getCommitsForTimeRange.mockResolvedValue(mockCommits);

      const results = await manager.collectDataFromRepositories(['repo1'], timeRange);

      expect(results).toHaveLength(1);
      expect(results[0]).toEqual({
        repository: 'repo1',
        success: true,
        data: mockCommits,
      });
    });

    it('should handle non-existent repositories', async () => {
      const results = await manager.collectDataFromRepositories(['non-existent'], timeRange);

      expect(results).toHaveLength(1);
      expect(results[0]).toEqual({
        repository: 'non-existent',
        success: false,
        error: "Repository 'non-existent' not found",
      });
    });
  });

  describe('convertToCollectedData', () => {
    it('should convert successful results to CollectedData format', () => {
      const timeRange: TimeRange = {
        start: new Date('2023-01-01'),
        end: new Date('2023-01-31'),
        type: 'monthly',
      };

      const mockCommits: GitCommit[] = [
        {
          hash: 'abc123',
          author: 'John Doe',
          date: new Date('2023-01-15'),
          message: 'Test commit',
          filesChanged: ['file.txt'],
          additions: 10,
          deletions: 2,
        },
      ];

      const results: RepositoryOperationResult[] = [
        {
          repository: 'repo1',
          success: true,
          data: mockCommits,
        },
        {
          repository: 'repo2',
          success: false,
          error: 'Failed',
        },
      ];

      const collectedData = manager.convertToCollectedData(results, timeRange);

      expect(collectedData).toHaveLength(1);
      expect(collectedData[0]).toEqual({
        source: 'git:repo1',
        timeRange,
        data: mockCommits,
      });
    });
  });

  describe('getRepositoriesSummary', () => {
    it('should get summary of all repositories', async () => {
      const repo: GitRepository = {
        name: 'repo1',
        path: '/repo1',
        remote: 'https://github.com/user/repo.git',
        credentials: { username: 'user', token: 'token' },
      };

      (GitCommandInterface.validateRepositoryConfig as any).mockReturnValue({
        isValid: true,
        errors: [],
      });

      manager.addRepository(repo);

      mockGitInterface.getRepository.mockReturnValue(repo);
      mockGitInterface.validateRepository.mockResolvedValue(true);
      mockGitInterface.testRemoteConnection.mockResolvedValue(true);
      mockGitInterface.getRepositoryInfo.mockResolvedValue({
        branch: 'main',
        remote: 'https://github.com/user/repo.git',
      });

      const summary = await manager.getRepositoriesSummary();

      expect(summary).toHaveLength(1);
      expect(summary[0]).toEqual({
        name: 'repo1',
        path: '/repo1',
        remote: 'https://github.com/user/repo.git',
        branch: 'main',
        isValid: true,
        canConnectToRemote: true,
        hasCredentials: true,
      });
    });

    it('should handle errors in summary generation', async () => {
      const repo: GitRepository = { name: 'repo1', path: '/repo1' };

      (GitCommandInterface.validateRepositoryConfig as any).mockReturnValue({
        isValid: true,
        errors: [],
      });

      manager.addRepository(repo);

      mockGitInterface.getRepository.mockReturnValue(repo);
      mockGitInterface.validateRepository.mockRejectedValue(new Error('Validation failed'));

      const summary = await manager.getRepositoriesSummary();

      expect(summary[0]).toEqual({
        name: 'repo1',
        path: '/repo1',
        remote: undefined,
        branch: 'unknown',
        isValid: false,
        canConnectToRemote: false,
        hasCredentials: false,
      });
    });
  });

  describe('utility methods', () => {
    it('should clear all repositories', () => {
      const repo: GitRepository = { name: 'repo1', path: '/repo1' };

      (GitCommandInterface.validateRepositoryConfig as any).mockReturnValue({
        isValid: true,
        errors: [],
      });

      manager.addRepository(repo);
      expect(manager.size()).toBe(1);

      manager.clear();
      expect(manager.size()).toBe(0);
    });

    it('should return correct size', () => {
      expect(manager.size()).toBe(0);

      const repo1: GitRepository = { name: 'repo1', path: '/repo1' };
      const repo2: GitRepository = { name: 'repo2', path: '/repo2' };

      (GitCommandInterface.validateRepositoryConfig as any).mockReturnValue({
        isValid: true,
        errors: [],
      });

      manager.addRepository(repo1);
      expect(manager.size()).toBe(1);

      manager.addRepository(repo2);
      expect(manager.size()).toBe(2);
    });
  });
});