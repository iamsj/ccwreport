import { GitCommit, TimeRange, GitRepository } from '../models/config';

export interface GitDataFilter {
  username?: string;
  dateRange?: TimeRange;
  repositories?: string[];
  maxCommits?: number;
  includeFileChanges?: boolean;
  excludePatterns?: string[];
  includePatterns?: string[];
}

export interface ProcessedGitData {
  commits: GitCommit[];
  summary: {
    totalCommits: number;
    totalAdditions: number;
    totalDeletions: number;
    totalFilesChanged: number;
    dateRange: TimeRange;
    repositories: string[];
    authors: string[];
  };
  metadata: {
    processedAt: Date;
    filter: GitDataFilter;
    hasMoreData: boolean;
  };
}

export class GitDataProcessor {
  /**
   * Filter commits based on provided criteria
   */
  static filterCommits(commits: GitCommit[], filter: GitDataFilter): GitCommit[] {
    let filteredCommits = [...commits];

    // Filter by username/author
    if (filter.username) {
      const usernamePattern = new RegExp(filter.username, 'i');
      filteredCommits = filteredCommits.filter(commit => 
        usernamePattern.test(commit.author)
      );
    }

    // Filter by date range
    if (filter.dateRange) {
      filteredCommits = filteredCommits.filter(commit => 
        commit.date >= filter.dateRange!.start && commit.date <= filter.dateRange!.end
      );
    }

    // Filter by file patterns (exclude)
    if (filter.excludePatterns && filter.excludePatterns.length > 0) {
      filteredCommits = filteredCommits.filter(commit => {
        return !commit.filesChanged.some(file => 
          filter.excludePatterns!.some(pattern => {
            try {
              return new RegExp(pattern).test(file);
            } catch {
              return false; // Invalid regex patterns are ignored
            }
          })
        );
      });
    }

    // Filter by file patterns (include)
    if (filter.includePatterns && filter.includePatterns.length > 0) {
      filteredCommits = filteredCommits.filter(commit => {
        return commit.filesChanged.some(file => 
          filter.includePatterns!.some(pattern => {
            try {
              return new RegExp(pattern).test(file);
            } catch {
              return false; // Invalid regex patterns are ignored
            }
          })
        );
      });
    }

    // Sort by date (newest first)
    filteredCommits.sort((a, b) => b.date.getTime() - a.date.getTime());

    // Limit results
    if (filter.maxCommits && filter.maxCommits > 0) {
      filteredCommits = filteredCommits.slice(0, filter.maxCommits);
    }

    return filteredCommits;
  }

  /**
   * Process and analyze git commit data
   */
  static processCommitData(
    commits: GitCommit[], 
    filter: GitDataFilter,
    repositoryNames: string[] = []
  ): ProcessedGitData {
    const filteredCommits = this.filterCommits(commits, filter);
    
    // Calculate summary statistics
    const summary = this.calculateSummary(filteredCommits, filter, repositoryNames);
    
    // Create metadata
    const metadata = {
      processedAt: new Date(),
      filter,
      hasMoreData: filter.maxCommits ? commits.length > filter.maxCommits : false,
    };

    return {
      commits: filteredCommits,
      summary,
      metadata,
    };
  }

  /**
   * Calculate summary statistics for commits
   */
  private static calculateSummary(
    commits: GitCommit[], 
    filter: GitDataFilter,
    repositoryNames: string[]
  ): ProcessedGitData['summary'] {
    const totalCommits = commits.length;
    const totalAdditions = commits.reduce((sum, commit) => sum + commit.additions, 0);
    const totalDeletions = commits.reduce((sum, commit) => sum + commit.deletions, 0);
    
    // Count unique files changed
    const allFilesChanged = new Set<string>();
    commits.forEach(commit => {
      commit.filesChanged.forEach(file => allFilesChanged.add(file));
    });
    
    // Get unique authors
    const authors = Array.from(new Set(commits.map(commit => commit.author)));
    
    // Determine date range from actual commits or filter
    let dateRange: TimeRange;
    if (commits.length > 0) {
      const dates = commits.map(commit => commit.date);
      const minDate = new Date(Math.min(...dates.map(d => d.getTime())));
      const maxDate = new Date(Math.max(...dates.map(d => d.getTime())));
      
      dateRange = {
        start: minDate,
        end: maxDate,
        type: filter.dateRange?.type || 'daily',
      };
    } else {
      dateRange = filter.dateRange || {
        start: new Date(),
        end: new Date(),
        type: 'daily',
      };
    }

    return {
      totalCommits,
      totalAdditions,
      totalDeletions,
      totalFilesChanged: allFilesChanged.size,
      dateRange,
      repositories: repositoryNames,
      authors,
    };
  }

  /**
   * Validate date range for filtering
   */
  static validateDateRange(dateRange: TimeRange): { isValid: boolean; errors: string[] } {
    const errors: string[] = [];

    if (!dateRange.start || !dateRange.end) {
      errors.push('Start and end dates are required');
      return { isValid: false, errors };
    }

    if (dateRange.start >= dateRange.end) {
      errors.push('Start date must be before end date');
    }

    const now = new Date();
    if (dateRange.end > now) {
      errors.push('End date cannot be in the future');
    }

    // Check for reasonable date range limits
    const daysDiff = Math.ceil((dateRange.end.getTime() - dateRange.start.getTime()) / (1000 * 60 * 60 * 24));
    
    if (daysDiff > 365) {
      errors.push('Date range cannot exceed 365 days');
    }

    if (daysDiff < 0) {
      errors.push('Invalid date range');
    }

    return {
      isValid: errors.length === 0,
      errors,
    };
  }

  /**
   * Create time range for different report types
   */
  static createTimeRangeForReportType(
    type: 'daily' | 'weekly' | 'monthly',
    referenceDate: Date = new Date()
  ): TimeRange {
    const end = new Date(referenceDate);
    end.setUTCHours(23, 59, 59, 999); // End of day in UTC
    
    const start = new Date(referenceDate);
    
    switch (type) {
      case 'daily':
        start.setUTCHours(0, 0, 0, 0); // Start of day in UTC
        break;
      case 'weekly':
        start.setUTCDate(start.getUTCDate() - 6); // 7 days ago
        start.setUTCHours(0, 0, 0, 0);
        break;
      case 'monthly':
        start.setUTCDate(start.getUTCDate() - 29); // 30 days ago
        start.setUTCHours(0, 0, 0, 0);
        break;
    }

    return {
      start,
      end,
      type,
    };
  }

  /**
   * Merge commits from multiple repositories
   */
  static mergeCommitsFromRepositories(
    repositoryCommits: Array<{ repository: string; commits: GitCommit[] }>
  ): GitCommit[] {
    const allCommits: GitCommit[] = [];
    
    repositoryCommits.forEach(({ commits }) => {
      allCommits.push(...commits);
    });

    // Sort by date (newest first) and remove duplicates by hash
    const uniqueCommits = new Map<string, GitCommit>();
    
    allCommits
      .sort((a, b) => b.date.getTime() - a.date.getTime())
      .forEach(commit => {
        if (!uniqueCommits.has(commit.hash)) {
          uniqueCommits.set(commit.hash, commit);
        }
      });

    return Array.from(uniqueCommits.values());
  }

  /**
   * Handle edge cases in commit data
   */
  static sanitizeCommitData(commits: GitCommit[]): GitCommit[] {
    return commits.map(commit => ({
      ...commit,
      // Ensure author is not empty
      author: commit.author?.trim() || 'Unknown Author',
      // Ensure message is not empty
      message: commit.message?.trim() || 'No commit message',
      // Ensure arrays are not null/undefined
      filesChanged: commit.filesChanged || [],
      // Ensure numeric values are valid
      additions: Math.max(0, commit.additions || 0),
      deletions: Math.max(0, commit.deletions || 0),
      // Ensure date is valid
      date: commit.date && !isNaN(commit.date.getTime()) ? commit.date : new Date(),
    }));
  }

  /**
   * Group commits by time period
   */
  static groupCommitsByTimePeriod(
    commits: GitCommit[],
    period: 'day' | 'week' | 'month'
  ): Map<string, GitCommit[]> {
    const groups = new Map<string, GitCommit[]>();

    commits.forEach(commit => {
      let key: string;
      
      switch (period) {
        case 'day':
          key = commit.date.toISOString().split('T')[0]; // YYYY-MM-DD
          break;
        case 'week':
          const weekStart = new Date(commit.date);
          weekStart.setDate(weekStart.getDate() - weekStart.getDay());
          key = weekStart.toISOString().split('T')[0];
          break;
        case 'month':
          key = `${commit.date.getFullYear()}-${String(commit.date.getMonth() + 1).padStart(2, '0')}`;
          break;
      }

      if (!groups.has(key)) {
        groups.set(key, []);
      }
      groups.get(key)!.push(commit);
    });

    return groups;
  }

  /**
   * Get commit statistics by author
   */
  static getCommitStatsByAuthor(commits: GitCommit[]): Map<string, {
    commitCount: number;
    totalAdditions: number;
    totalDeletions: number;
    filesChanged: Set<string>;
    firstCommit: Date;
    lastCommit: Date;
  }> {
    const stats = new Map();

    commits.forEach(commit => {
      const author = commit.author;
      
      if (!stats.has(author)) {
        stats.set(author, {
          commitCount: 0,
          totalAdditions: 0,
          totalDeletions: 0,
          filesChanged: new Set<string>(),
          firstCommit: commit.date,
          lastCommit: commit.date,
        });
      }

      const authorStats = stats.get(author);
      authorStats.commitCount++;
      authorStats.totalAdditions += commit.additions;
      authorStats.totalDeletions += commit.deletions;
      
      commit.filesChanged.forEach(file => authorStats.filesChanged.add(file));
      
      if (commit.date < authorStats.firstCommit) {
        authorStats.firstCommit = commit.date;
      }
      if (commit.date > authorStats.lastCommit) {
        authorStats.lastCommit = commit.date;
      }
    });

    return stats;
  }
}