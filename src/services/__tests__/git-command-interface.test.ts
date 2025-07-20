import { describe, it, expect, vi, beforeEach } from 'vitest';
import { GitCommandInterface } from '../git-command-interface';
import { GitRepository, TimeRange } from '../../models/config';

// Mock simple-git
vi.mock('simple-git', () => ({
  simpleGit: vi.fn(),
}));

describe('GitCommandInterface', () => {
  let mockGit: any;
  let gitInterface: GitCommandInterface;
  let mockSimpleGit: any;
  const mockRepoPath = '/test/repo';

  beforeEach(async () => {
    // Reset all mocks
    vi.clearAllMocks();
    
    // Create mock git instance
    mockGit = {
      log: vi.fn(),
      status: vi.fn(),
      getRemotes: vi.fn(),
    };

    // Get the mocked simpleGit function
    const { simpleGit } = await import('simple-git');
    mockSimpleGit = simpleGit as any;
    mockSimpleGit.mockReturnValue(mockGit);

    gitInterface = new GitCommandInterface(mockRepoPath);
  });

  describe('constructor', () => {
    it('should create instance with correct repo path', () => {
      expect(mockSimpleGit).toHaveBeenCalledWith(mockRepoPath);
    });
  });

  describe('getCommits', () => {
    const mockLogResult = {
      all: [
        {
          hash: 'abc123',
          author_name: 'John Doe',
          date: '2023-01-01T10:00:00Z',
          message: 'Initial commit',
          diff: {
            files: [
              { file: 'README.md', insertions: 10, deletions: 0 },
              { file: 'src/index.ts', insertions: 50, deletions: 5 },
            ],
          },
        },
        {
          hash: 'def456',
          author_name: 'Jane Smith',
          date: '2023-01-02T15:30:00Z',
          message: 'Add new feature',
          diff: {
            files: [
              { file: 'src/feature.ts', insertions: 25, deletions: 2 },
            ],
          },
        },
      ],
    };

    it('should get commits with default options', async () => {
      mockGit.log.mockResolvedValue(mockLogResult);

      const commits = await gitInterface.getCommits();

      expect(mockGit.log).toHaveBeenCalledWith({
        '--stat': null,
        '--numstat': null,
      });
      expect(commits).toHaveLength(2);
      expect(commits[0]).toEqual({
        hash: 'abc123',
        author: 'John Doe',
        date: new Date('2023-01-01T10:00:00Z'),
        message: 'Initial commit',
        filesChanged: ['README.md', 'src/index.ts'],
        additions: 60,
        deletions: 5,
      });
    });

    it('should get commits with author filter', async () => {
      mockGit.log.mockResolvedValue(mockLogResult);

      await gitInterface.getCommits({ author: 'John Doe' });

      expect(mockGit.log).toHaveBeenCalledWith({
        author: 'John Doe',
        '--stat': null,
        '--numstat': null,
      });
    });

    it('should get commits with date range', async () => {
      mockGit.log.mockResolvedValue(mockLogResult);
      const since = new Date('2023-01-01');
      const until = new Date('2023-01-31');

      await gitInterface.getCommits({ since, until });

      expect(mockGit.log).toHaveBeenCalledWith({
        since: since.toISOString(),
        until: until.toISOString(),
        '--stat': null,
        '--numstat': null,
      });
    });

    it('should get commits with max count limit', async () => {
      mockGit.log.mockResolvedValue(mockLogResult);

      await gitInterface.getCommits({ maxCount: 10 });

      expect(mockGit.log).toHaveBeenCalledWith({
        maxCount: 10,
        '--stat': null,
        '--numstat': null,
      });
    });

    it('should handle commits without diff statistics', async () => {
      const logResultWithoutDiff = {
        all: [
          {
            hash: 'xyz789',
            author_name: 'Test User',
            date: '2023-01-03T12:00:00Z',
            message: 'Test commit',
            // No diff property
          },
        ],
      };

      mockGit.log.mockResolvedValue(logResultWithoutDiff);

      const commits = await gitInterface.getCommits();

      expect(commits[0]).toEqual({
        hash: 'xyz789',
        author: 'Test User',
        date: new Date('2023-01-03T12:00:00Z'),
        message: 'Test commit',
        filesChanged: [],
        additions: 0,
        deletions: 0,
      });
    });

    it('should throw error when git log fails', async () => {
      mockGit.log.mockRejectedValue(new Error('Git command failed'));

      await expect(gitInterface.getCommits()).rejects.toThrow(
        'Failed to get git commits: Git command failed'
      );
    });
  });

  describe('getCommitsForTimeRange', () => {
    const timeRange: TimeRange = {
      start: new Date('2023-01-01'),
      end: new Date('2023-01-31'),
      type: 'monthly',
    };

    it('should get commits for time range without author', async () => {
      const mockLogResult = { all: [] };
      mockGit.log.mockResolvedValue(mockLogResult);

      await gitInterface.getCommitsForTimeRange(timeRange);

      expect(mockGit.log).toHaveBeenCalledWith({
        since: timeRange.start.toISOString(),
        until: timeRange.end.toISOString(),
        '--stat': null,
        '--numstat': null,
      });
    });

    it('should get commits for time range with author', async () => {
      const mockLogResult = { all: [] };
      mockGit.log.mockResolvedValue(mockLogResult);

      await gitInterface.getCommitsForTimeRange(timeRange, 'John Doe');

      expect(mockGit.log).toHaveBeenCalledWith({
        author: 'John Doe',
        since: timeRange.start.toISOString(),
        until: timeRange.end.toISOString(),
        '--stat': null,
        '--numstat': null,
      });
    });
  });

  describe('validateRepository', () => {
    it('should return true for valid repository', async () => {
      mockGit.status.mockResolvedValue({ current: 'main' });

      const isValid = await gitInterface.validateRepository();

      expect(isValid).toBe(true);
      expect(mockGit.status).toHaveBeenCalled();
    });

    it('should return false for invalid repository', async () => {
      mockGit.status.mockRejectedValue(new Error('Not a git repository'));

      const isValid = await gitInterface.validateRepository();

      expect(isValid).toBe(false);
    });
  });

  describe('getRepositoryInfo', () => {
    it('should get repository info with remote', async () => {
      mockGit.status.mockResolvedValue({ current: 'main' });
      mockGit.getRemotes.mockResolvedValue([
        {
          name: 'origin',
          refs: {
            fetch: 'https://github.com/user/repo.git',
            push: 'https://github.com/user/repo.git',
          },
        },
      ]);

      const info = await gitInterface.getRepositoryInfo();

      expect(info).toEqual({
        branch: 'main',
        remote: 'https://github.com/user/repo.git',
      });
    });

    it('should get repository info without remote', async () => {
      mockGit.status.mockResolvedValue({ current: 'develop' });
      mockGit.getRemotes.mockResolvedValue([]);

      const info = await gitInterface.getRepositoryInfo();

      expect(info).toEqual({
        branch: 'develop',
        remote: undefined,
      });
    });

    it('should handle missing current branch', async () => {
      mockGit.status.mockResolvedValue({ current: null });
      mockGit.getRemotes.mockResolvedValue([]);

      const info = await gitInterface.getRepositoryInfo();

      expect(info).toEqual({
        branch: 'unknown',
        remote: undefined,
      });
    });

    it('should throw error when repository info fails', async () => {
      mockGit.status.mockRejectedValue(new Error('Repository access failed'));

      await expect(gitInterface.getRepositoryInfo()).rejects.toThrow(
        'Failed to get repository info: Repository access failed'
      );
    });
  });

  describe('create static method', () => {
    it('should create GitCommandInterface instance from repository config', () => {
      const repository: GitRepository = {
        name: 'test-repo',
        path: '/path/to/repo',
        remote: 'https://github.com/user/repo.git',
        branch: 'main',
      };

      const instance = GitCommandInterface.create(repository);

      expect(instance).toBeInstanceOf(GitCommandInterface);
      expect(mockSimpleGit).toHaveBeenCalledWith(repository.path);
    });
  });

  describe('parseCommits private method', () => {
    it('should handle empty log result', async () => {
      mockGit.log.mockResolvedValue({ all: [] });

      const commits = await gitInterface.getCommits();

      expect(commits).toEqual([]);
    });

    it('should handle commits with partial diff data', async () => {
      const logResultPartialDiff = {
        all: [
          {
            hash: 'partial123',
            author_name: 'Partial User',
            date: '2023-01-04T08:00:00Z',
            message: 'Partial commit',
            diff: {
              files: [
                { file: 'test.txt', insertions: 5 }, // Missing deletions
                { file: 'another.txt', deletions: 3 }, // Missing insertions
              ],
            },
          },
        ],
      };

      mockGit.log.mockResolvedValue(logResultPartialDiff);

      const commits = await gitInterface.getCommits();

      expect(commits[0]).toEqual({
        hash: 'partial123',
        author: 'Partial User',
        date: new Date('2023-01-04T08:00:00Z'),
        message: 'Partial commit',
        filesChanged: ['test.txt', 'another.txt'],
        additions: 5,
        deletions: 3,
      });
    });
  });

  describe('authentication and repository handling', () => {
    beforeEach(() => {
      mockGit.remote = vi.fn();
      mockGit.clone = vi.fn();
      mockGit.fetch = vi.fn();
      mockGit.raw = vi.fn();
    });

    describe('configureAuthentication', () => {
      it('should configure authentication for HTTPS remote', async () => {
        const repository: GitRepository = {
          name: 'test-repo',
          path: '/test/repo',
          remote: 'https://github.com/user/repo.git',
        };
        
        const gitInterfaceWithRepo = new GitCommandInterface(repository.path, repository);
        const credentials = { username: 'testuser', token: 'testtoken' };

        await gitInterfaceWithRepo.configureAuthentication(credentials);

        expect(mockGit.remote).toHaveBeenCalledWith([
          'set-url',
          'origin',
          'https://testuser:testtoken@github.com/user/repo.git',
        ]);
      });

      it('should handle SSH remote URLs without modification', async () => {
        const repository: GitRepository = {
          name: 'test-repo',
          path: '/test/repo',
          remote: 'git@github.com:user/repo.git',
        };
        
        const gitInterfaceWithRepo = new GitCommandInterface(repository.path, repository);
        const credentials = { username: 'testuser', token: 'testtoken' };

        await gitInterfaceWithRepo.configureAuthentication(credentials);

        expect(mockGit.remote).toHaveBeenCalledWith([
          'set-url',
          'origin',
          'git@github.com:user/repo.git',
        ]);
      });

      it('should throw error when authentication configuration fails', async () => {
        const repository: GitRepository = {
          name: 'test-repo',
          path: '/test/repo',
          remote: 'https://github.com/user/repo.git',
        };
        
        const gitInterfaceWithRepo = new GitCommandInterface(repository.path, repository);
        const credentials = { username: 'testuser', token: 'testtoken' };

        mockGit.remote.mockRejectedValue(new Error('Remote configuration failed'));

        await expect(gitInterfaceWithRepo.configureAuthentication(credentials)).rejects.toThrow(
          'Failed to configure authentication: Remote configuration failed'
        );
      });
    });

    describe('cloneRepository', () => {
      it('should clone repository with credentials', async () => {
        const repository: GitRepository = {
          name: 'test-repo',
          path: '/test/repo',
          remote: 'https://github.com/user/repo.git',
          branch: 'main',
        };
        
        const gitInterfaceWithRepo = new GitCommandInterface(repository.path, repository);
        const credentials = { username: 'testuser', token: 'testtoken' };

        await gitInterfaceWithRepo.cloneRepository('/target/path', credentials);

        expect(mockGit.clone).toHaveBeenCalledWith(
          'https://testuser:testtoken@github.com/user/repo.git',
          '/target/path',
          {
            '--branch': 'main',
            '--single-branch': null,
          }
        );
      });

      it('should clone repository without credentials', async () => {
        const repository: GitRepository = {
          name: 'test-repo',
          path: '/test/repo',
          remote: 'https://github.com/user/repo.git',
        };
        
        const gitInterfaceWithRepo = new GitCommandInterface(repository.path, repository);

        await gitInterfaceWithRepo.cloneRepository('/target/path');

        expect(mockGit.clone).toHaveBeenCalledWith(
          'https://github.com/user/repo.git',
          '/target/path',
          {
            '--branch': 'main',
            '--single-branch': null,
          }
        );
      });

      it('should throw error when no remote URL is specified', async () => {
        const repository: GitRepository = {
          name: 'test-repo',
          path: '/test/repo',
        };
        
        const gitInterfaceWithRepo = new GitCommandInterface(repository.path, repository);

        await expect(gitInterfaceWithRepo.cloneRepository('/target/path')).rejects.toThrow(
          'No remote URL specified for cloning'
        );
      });
    });

    describe('fetchRemote', () => {
      it('should fetch from remote with credentials', async () => {
        const repository: GitRepository = {
          name: 'test-repo',
          path: '/test/repo',
          remote: 'https://github.com/user/repo.git',
          branch: 'develop',
        };
        
        const gitInterfaceWithRepo = new GitCommandInterface(repository.path, repository);
        const credentials = { username: 'testuser', token: 'testtoken' };

        await gitInterfaceWithRepo.fetchRemote(credentials);

        expect(mockGit.remote).toHaveBeenCalled();
        expect(mockGit.fetch).toHaveBeenCalledWith('origin', 'develop');
      });

      it('should fetch from remote without credentials', async () => {
        const repository: GitRepository = {
          name: 'test-repo',
          path: '/test/repo',
          branch: 'main',
        };
        
        const gitInterfaceWithRepo = new GitCommandInterface(repository.path, repository);

        await gitInterfaceWithRepo.fetchRemote();

        expect(mockGit.fetch).toHaveBeenCalledWith('origin', 'main');
      });
    });

    describe('testRemoteConnection', () => {
      it('should return true for successful connection', async () => {
        const repository: GitRepository = {
          name: 'test-repo',
          path: '/test/repo',
          remote: 'https://github.com/user/repo.git',
        };
        
        const gitInterfaceWithRepo = new GitCommandInterface(repository.path, repository);
        mockGit.raw.mockResolvedValue('');

        const result = await gitInterfaceWithRepo.testRemoteConnection();

        expect(result).toBe(true);
        expect(mockGit.raw).toHaveBeenCalledWith(['ls-remote', '--heads', 'origin']);
      });

      it('should return false for failed connection', async () => {
        const repository: GitRepository = {
          name: 'test-repo',
          path: '/test/repo',
          remote: 'https://github.com/user/repo.git',
        };
        
        const gitInterfaceWithRepo = new GitCommandInterface(repository.path, repository);
        mockGit.raw.mockRejectedValue(new Error('Connection failed'));

        const result = await gitInterfaceWithRepo.testRemoteConnection();

        expect(result).toBe(false);
      });

      it('should return false when no remote URL is configured', async () => {
        const repository: GitRepository = {
          name: 'test-repo',
          path: '/test/repo',
        };
        
        const gitInterfaceWithRepo = new GitCommandInterface(repository.path, repository);

        const result = await gitInterfaceWithRepo.testRemoteConnection();

        expect(result).toBe(false);
      });
    });

    describe('repository management', () => {
      it('should get repository configuration', () => {
        const repository: GitRepository = {
          name: 'test-repo',
          path: '/test/repo',
          remote: 'https://github.com/user/repo.git',
          branch: 'main',
        };
        
        const gitInterfaceWithRepo = new GitCommandInterface(repository.path, repository);
        const config = gitInterfaceWithRepo.getRepository();

        expect(config).toEqual(repository);
      });

      it('should update repository configuration', () => {
        const repository: GitRepository = {
          name: 'test-repo',
          path: '/test/repo',
        };
        
        const gitInterfaceWithRepo = new GitCommandInterface(repository.path, repository);
        
        gitInterfaceWithRepo.updateRepository({
          remote: 'https://github.com/user/repo.git',
          branch: 'develop',
        });

        const updatedConfig = gitInterfaceWithRepo.getRepository();
        expect(updatedConfig.remote).toBe('https://github.com/user/repo.git');
        expect(updatedConfig.branch).toBe('develop');
      });
    });
  });

  describe('validateRepositoryConfig static method', () => {
    it('should validate correct repository configuration', () => {
      const repository: GitRepository = {
        name: 'test-repo',
        path: '/test/repo',
        remote: 'https://github.com/user/repo.git',
        branch: 'main',
        credentials: {
          username: 'testuser',
          token: 'testtoken',
        },
      };

      const result = GitCommandInterface.validateRepositoryConfig(repository);

      expect(result.isValid).toBe(true);
      expect(result.errors).toEqual([]);
    });

    it('should validate SSH repository configuration', () => {
      const repository: GitRepository = {
        name: 'test-repo',
        path: '/test/repo',
        remote: 'git@github.com:user/repo.git',
      };

      const result = GitCommandInterface.validateRepositoryConfig(repository);

      expect(result.isValid).toBe(true);
      expect(result.errors).toEqual([]);
    });

    it('should return errors for invalid configuration', () => {
      const repository: GitRepository = {
        name: '',
        path: '',
        remote: 'invalid-url',
        credentials: {
          username: '',
          token: '',
        },
      };

      const result = GitCommandInterface.validateRepositoryConfig(repository);

      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('Repository name is required');
      expect(result.errors).toContain('Repository path is required');
      expect(result.errors).toContain('Invalid remote URL format');
      expect(result.errors).toContain('Username is required when credentials are provided');
      expect(result.errors).toContain('Token is required when credentials are provided');
    });
  });
});