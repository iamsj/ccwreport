import { describe, it, expect, beforeEach } from 'vitest';
import { GitDataProcessor, GitDataFilter, ProcessedGitData } from '../git-data-processor';
import { GitCommit, TimeRange } from '../../models/config';

describe('GitDataProcessor', () => {
  let mockCommits: GitCommit[];

  beforeEach(() => {
    mockCommits = [
      {
        hash: 'abc123',
        author: 'John Doe',
        date: new Date('2023-01-15T10:00:00Z'),
        message: 'Add new feature',
        filesChanged: ['src/feature.ts', 'README.md'],
        additions: 50,
        deletions: 5,
      },
      {
        hash: 'def456',
        author: 'Jane Smith',
        date: new Date('2023-01-10T14:30:00Z'),
        message: 'Fix bug in authentication',
        filesChanged: ['src/auth.ts', 'tests/auth.test.ts'],
        additions: 25,
        deletions: 10,
      },
      {
        hash: 'ghi789',
        author: 'John Doe',
        date: new Date('2023-01-05T09:15:00Z'),
        message: 'Update documentation',
        filesChanged: ['docs/api.md', 'README.md'],
        additions: 15,
        deletions: 2,
      },
      {
        hash: 'jkl012',
        author: 'Bob Wilson',
        date: new Date('2023-01-20T16:45:00Z'),
        message: 'Refactor database layer',
        filesChanged: ['src/db/connection.ts', 'src/db/models.ts'],
        additions: 100,
        deletions: 30,
      },
    ];
  });

  describe('filterCommits', () => {
    it('should filter commits by username', () => {
      const filter: GitDataFilter = { username: 'John Doe' };
      const filtered = GitDataProcessor.filterCommits(mockCommits, filter);

      expect(filtered).toHaveLength(2);
      expect(filtered.every(commit => commit.author === 'John Doe')).toBe(true);
    });

    it('should filter commits by username with case insensitive matching', () => {
      const filter: GitDataFilter = { username: 'john' };
      const filtered = GitDataProcessor.filterCommits(mockCommits, filter);

      expect(filtered).toHaveLength(2);
      expect(filtered.every(commit => commit.author.toLowerCase().includes('john'))).toBe(true);
    });

    it('should filter commits by date range', () => {
      const dateRange: TimeRange = {
        start: new Date('2023-01-08T00:00:00Z'),
        end: new Date('2023-01-18T23:59:59Z'),
        type: 'weekly',
      };
      const filter: GitDataFilter = { dateRange };
      const filtered = GitDataProcessor.filterCommits(mockCommits, filter);

      expect(filtered).toHaveLength(2);
      expect(filtered.every(commit => 
        commit.date >= dateRange.start && commit.date <= dateRange.end
      )).toBe(true);
    });

    it('should filter commits by exclude patterns', () => {
      const filter: GitDataFilter = { excludePatterns: ['test', 'spec'] };
      const filtered = GitDataProcessor.filterCommits(mockCommits, filter);

      expect(filtered).toHaveLength(3);
      expect(filtered.every(commit => 
        !commit.filesChanged.some(file => /test|spec/i.test(file))
      )).toBe(true);
    });

    it('should filter commits by include patterns', () => {
      const filter: GitDataFilter = { includePatterns: ['src/.*\\.ts$'] };
      const filtered = GitDataProcessor.filterCommits(mockCommits, filter);

      expect(filtered).toHaveLength(3);
      expect(filtered.every(commit => 
        commit.filesChanged.some(file => /src\/.*\.ts$/.test(file))
      )).toBe(true);
    });

    it('should limit results with maxCommits', () => {
      const filter: GitDataFilter = { maxCommits: 2 };
      const filtered = GitDataProcessor.filterCommits(mockCommits, filter);

      expect(filtered).toHaveLength(2);
    });

    it('should sort commits by date (newest first)', () => {
      const filter: GitDataFilter = {};
      const filtered = GitDataProcessor.filterCommits(mockCommits, filter);

      expect(filtered[0].date.getTime()).toBeGreaterThan(filtered[1].date.getTime());
      expect(filtered[1].date.getTime()).toBeGreaterThan(filtered[2].date.getTime());
    });

    it('should handle empty commits array', () => {
      const filter: GitDataFilter = { username: 'John Doe' };
      const filtered = GitDataProcessor.filterCommits([], filter);

      expect(filtered).toEqual([]);
    });

    it('should handle multiple filters combined', () => {
      const dateRange: TimeRange = {
        start: new Date('2023-01-01T00:00:00Z'),
        end: new Date('2023-01-16T23:59:59Z'),
        type: 'weekly',
      };
      const filter: GitDataFilter = {
        username: 'John',
        dateRange,
        maxCommits: 1,
      };
      const filtered = GitDataProcessor.filterCommits(mockCommits, filter);

      expect(filtered).toHaveLength(1);
      expect(filtered[0].author).toContain('John');
      expect(filtered[0].date >= dateRange.start && filtered[0].date <= dateRange.end).toBe(true);
    });
  });

  describe('processCommitData', () => {
    it('should process commit data with summary and metadata', () => {
      const filter: GitDataFilter = { username: 'John Doe' };
      const repositoryNames = ['repo1', 'repo2'];
      const processed = GitDataProcessor.processCommitData(mockCommits, filter, repositoryNames);

      expect(processed.commits).toHaveLength(2);
      expect(processed.summary.totalCommits).toBe(2);
      expect(processed.summary.totalAdditions).toBe(65); // 50 + 15
      expect(processed.summary.totalDeletions).toBe(7); // 5 + 2
      expect(processed.summary.totalFilesChanged).toBe(3); // unique files
      expect(processed.summary.repositories).toEqual(repositoryNames);
      expect(processed.summary.authors).toEqual(['John Doe']);
      expect(processed.metadata.filter).toEqual(filter);
      expect(processed.metadata.hasMoreData).toBe(false);
    });

    it('should indicate hasMoreData when maxCommits is applied', () => {
      const filter: GitDataFilter = { maxCommits: 2 };
      const processed = GitDataProcessor.processCommitData(mockCommits, filter);

      expect(processed.commits).toHaveLength(2);
      expect(processed.metadata.hasMoreData).toBe(true);
    });

    it('should handle empty commits array', () => {
      const filter: GitDataFilter = {};
      const processed = GitDataProcessor.processCommitData([], filter);

      expect(processed.commits).toEqual([]);
      expect(processed.summary.totalCommits).toBe(0);
      expect(processed.summary.totalAdditions).toBe(0);
      expect(processed.summary.totalDeletions).toBe(0);
      expect(processed.summary.totalFilesChanged).toBe(0);
      expect(processed.summary.authors).toEqual([]);
    });

    it('should calculate correct date range from commits', () => {
      const filter: GitDataFilter = {};
      const processed = GitDataProcessor.processCommitData(mockCommits, filter);

      expect(processed.summary.dateRange.start).toEqual(new Date('2023-01-05T09:15:00Z'));
      expect(processed.summary.dateRange.end).toEqual(new Date('2023-01-20T16:45:00Z'));
    });
  });

  describe('validateDateRange', () => {
    it('should validate correct date range', () => {
      const dateRange: TimeRange = {
        start: new Date('2023-01-01'),
        end: new Date('2023-01-31'),
        type: 'monthly',
      };

      const result = GitDataProcessor.validateDateRange(dateRange);

      expect(result.isValid).toBe(true);
      expect(result.errors).toEqual([]);
    });

    it('should reject date range with start after end', () => {
      const dateRange: TimeRange = {
        start: new Date('2023-01-31'),
        end: new Date('2023-01-01'),
        type: 'monthly',
      };

      const result = GitDataProcessor.validateDateRange(dateRange);

      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('Start date must be before end date');
    });

    it('should reject date range with future end date', () => {
      const futureDate = new Date();
      futureDate.setDate(futureDate.getDate() + 10);

      const dateRange: TimeRange = {
        start: new Date('2023-01-01'),
        end: futureDate,
        type: 'monthly',
      };

      const result = GitDataProcessor.validateDateRange(dateRange);

      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('End date cannot be in the future');
    });

    it('should reject date range exceeding 365 days', () => {
      const dateRange: TimeRange = {
        start: new Date('2022-01-01'),
        end: new Date('2023-12-31'),
        type: 'monthly',
      };

      const result = GitDataProcessor.validateDateRange(dateRange);

      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('Date range cannot exceed 365 days');
    });

    it('should reject missing dates', () => {
      const dateRange = {
        start: null as any,
        end: null as any,
        type: 'daily' as const,
      };

      const result = GitDataProcessor.validateDateRange(dateRange);

      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('Start and end dates are required');
    });
  });

  describe('createTimeRangeForReportType', () => {
    const referenceDate = new Date('2023-01-15T12:00:00Z');

    it('should create daily time range', () => {
      const timeRange = GitDataProcessor.createTimeRangeForReportType('daily', referenceDate);

      expect(timeRange.type).toBe('daily');
      expect(timeRange.start.toISOString()).toBe('2023-01-15T00:00:00.000Z');
      expect(timeRange.end.toISOString()).toBe('2023-01-15T23:59:59.999Z');
    });

    it('should create weekly time range', () => {
      const timeRange = GitDataProcessor.createTimeRangeForReportType('weekly', referenceDate);

      expect(timeRange.type).toBe('weekly');
      expect(timeRange.start.toISOString()).toBe('2023-01-09T00:00:00.000Z');
      expect(timeRange.end.toISOString()).toBe('2023-01-15T23:59:59.999Z');
    });

    it('should create monthly time range', () => {
      const timeRange = GitDataProcessor.createTimeRangeForReportType('monthly', referenceDate);

      expect(timeRange.type).toBe('monthly');
      expect(timeRange.start.toISOString()).toBe('2022-12-17T00:00:00.000Z');
      expect(timeRange.end.toISOString()).toBe('2023-01-15T23:59:59.999Z');
    });

    it('should use current date when no reference date provided', () => {
      const timeRange = GitDataProcessor.createTimeRangeForReportType('daily');

      expect(timeRange.type).toBe('daily');
      expect(timeRange.start).toBeInstanceOf(Date);
      expect(timeRange.end).toBeInstanceOf(Date);
    });
  });

  describe('mergeCommitsFromRepositories', () => {
    it('should merge commits from multiple repositories', () => {
      const repo1Commits = mockCommits.slice(0, 2);
      const repo2Commits = mockCommits.slice(2, 4);

      const repositoryCommits = [
        { repository: 'repo1', commits: repo1Commits },
        { repository: 'repo2', commits: repo2Commits },
      ];

      const merged = GitDataProcessor.mergeCommitsFromRepositories(repositoryCommits);

      expect(merged).toHaveLength(4);
      expect(merged[0].date.getTime()).toBeGreaterThanOrEqual(merged[1].date.getTime());
    });

    it('should remove duplicate commits by hash', () => {
      const duplicateCommit = { ...mockCommits[0] };
      const repo1Commits = [mockCommits[0], mockCommits[1]];
      const repo2Commits = [duplicateCommit, mockCommits[2]];

      const repositoryCommits = [
        { repository: 'repo1', commits: repo1Commits },
        { repository: 'repo2', commits: repo2Commits },
      ];

      const merged = GitDataProcessor.mergeCommitsFromRepositories(repositoryCommits);

      expect(merged).toHaveLength(3);
      expect(merged.filter(commit => commit.hash === mockCommits[0].hash)).toHaveLength(1);
    });

    it('should handle empty repository commits', () => {
      const repositoryCommits = [
        { repository: 'repo1', commits: [] },
        { repository: 'repo2', commits: mockCommits.slice(0, 2) },
      ];

      const merged = GitDataProcessor.mergeCommitsFromRepositories(repositoryCommits);

      expect(merged).toHaveLength(2);
    });
  });

  describe('sanitizeCommitData', () => {
    it('should sanitize commit data with missing fields', () => {
      const dirtyCommits: any[] = [
        {
          hash: 'abc123',
          author: '',
          date: new Date('2023-01-15'),
          message: '',
          filesChanged: null,
          additions: -5,
          deletions: undefined,
        },
        {
          hash: 'def456',
          author: '  John Doe  ',
          date: new Date('invalid'),
          message: '  Fix bug  ',
          filesChanged: ['file.ts'],
          additions: 10,
          deletions: 2,
        },
      ];

      const sanitized = GitDataProcessor.sanitizeCommitData(dirtyCommits);

      expect(sanitized[0].author).toBe('Unknown Author');
      expect(sanitized[0].message).toBe('No commit message');
      expect(sanitized[0].filesChanged).toEqual([]);
      expect(sanitized[0].additions).toBe(0);
      expect(sanitized[0].deletions).toBe(0);
      expect(sanitized[0].date).toBeInstanceOf(Date);

      expect(sanitized[1].author).toBe('John Doe');
      expect(sanitized[1].message).toBe('Fix bug');
      expect(sanitized[1].filesChanged).toEqual(['file.ts']);
      expect(sanitized[1].additions).toBe(10);
      expect(sanitized[1].deletions).toBe(2);
    });

    it('should handle valid commit data without changes', () => {
      const sanitized = GitDataProcessor.sanitizeCommitData(mockCommits);

      expect(sanitized).toEqual(mockCommits);
    });
  });

  describe('groupCommitsByTimePeriod', () => {
    it('should group commits by day', () => {
      const groups = GitDataProcessor.groupCommitsByTimePeriod(mockCommits, 'day');

      expect(groups.size).toBe(4);
      expect(groups.has('2023-01-15')).toBe(true);
      expect(groups.has('2023-01-10')).toBe(true);
      expect(groups.has('2023-01-05')).toBe(true);
      expect(groups.has('2023-01-20')).toBe(true);
    });

    it('should group commits by week', () => {
      const groups = GitDataProcessor.groupCommitsByTimePeriod(mockCommits, 'week');

      expect(groups.size).toBeGreaterThan(0);
      // Each group should contain commits from the same week
      groups.forEach(commits => {
        expect(commits.length).toBeGreaterThan(0);
      });
    });

    it('should group commits by month', () => {
      const groups = GitDataProcessor.groupCommitsByTimePeriod(mockCommits, 'month');

      expect(groups.has('2023-01')).toBe(true);
      expect(groups.get('2023-01')).toHaveLength(4);
    });

    it('should handle empty commits array', () => {
      const groups = GitDataProcessor.groupCommitsByTimePeriod([], 'day');

      expect(groups.size).toBe(0);
    });
  });

  describe('getCommitStatsByAuthor', () => {
    it('should calculate stats by author', () => {
      const stats = GitDataProcessor.getCommitStatsByAuthor(mockCommits);

      expect(stats.size).toBe(3);

      const johnStats = stats.get('John Doe');
      expect(johnStats.commitCount).toBe(2);
      expect(johnStats.totalAdditions).toBe(65); // 50 + 15
      expect(johnStats.totalDeletions).toBe(7); // 5 + 2
      expect(johnStats.filesChanged.size).toBe(3); // unique files
      expect(johnStats.firstCommit).toEqual(new Date('2023-01-05T09:15:00Z'));
      expect(johnStats.lastCommit).toEqual(new Date('2023-01-15T10:00:00Z'));

      const janeStats = stats.get('Jane Smith');
      expect(janeStats.commitCount).toBe(1);
      expect(janeStats.totalAdditions).toBe(25);
      expect(janeStats.totalDeletions).toBe(10);

      const bobStats = stats.get('Bob Wilson');
      expect(bobStats.commitCount).toBe(1);
      expect(bobStats.totalAdditions).toBe(100);
      expect(bobStats.totalDeletions).toBe(30);
    });

    it('should handle empty commits array', () => {
      const stats = GitDataProcessor.getCommitStatsByAuthor([]);

      expect(stats.size).toBe(0);
    });

    it('should handle single commit', () => {
      const singleCommit = [mockCommits[0]];
      const stats = GitDataProcessor.getCommitStatsByAuthor(singleCommit);

      expect(stats.size).toBe(1);
      const authorStats = stats.get('John Doe');
      expect(authorStats.commitCount).toBe(1);
      expect(authorStats.firstCommit).toEqual(authorStats.lastCommit);
    });
  });

  describe('edge cases', () => {
    it('should handle commits with invalid dates', () => {
      const commitsWithInvalidDates: any[] = [
        {
          ...mockCommits[0],
          date: new Date('invalid-date'),
        },
        {
          ...mockCommits[1],
          date: null,
        },
      ];

      const sanitized = GitDataProcessor.sanitizeCommitData(commitsWithInvalidDates);
      
      expect(sanitized[0].date).toBeInstanceOf(Date);
      expect(sanitized[1].date).toBeInstanceOf(Date);
      expect(isNaN(sanitized[0].date.getTime())).toBe(false);
      expect(isNaN(sanitized[1].date.getTime())).toBe(false);
    });

    it('should handle very large commit datasets', () => {
      const largeCommitSet: GitCommit[] = Array.from({ length: 10000 }, (_, i) => ({
        hash: `commit${i}`,
        author: `Author ${i % 100}`,
        date: new Date(2023, 0, 1 + (i % 365)),
        message: `Commit message ${i}`,
        filesChanged: [`file${i}.ts`],
        additions: i % 100,
        deletions: i % 50,
      }));

      const filter: GitDataFilter = { maxCommits: 100 };
      const processed = GitDataProcessor.processCommitData(largeCommitSet, filter);

      expect(processed.commits).toHaveLength(100);
      expect(processed.metadata.hasMoreData).toBe(true);
    });

    it('should handle regex pattern errors gracefully', () => {
      const filter: GitDataFilter = { 
        excludePatterns: ['[invalid-regex'],
        includePatterns: ['*invalid-regex*'],
      };

      // Should not throw error even with invalid regex patterns
      expect(() => {
        GitDataProcessor.filterCommits(mockCommits, filter);
      }).not.toThrow();
    });
  });
});