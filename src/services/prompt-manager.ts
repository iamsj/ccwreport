// Prompt management and processing for AI report generation

import { ReportType, CollectedData, GitCommit, TimeRange } from '../models/config';
import { AIProcessingRequest, ProcessedReport } from '../models/ai';

/**
 * Template variables that can be used in prompts
 */
export interface PromptVariables {
  reportType: ReportType;
  timeRange: TimeRange;
  commits: GitCommit[];
  totalCommits: number;
  authors: string[];
  repositories: string[];
  dateRange: string;
  commitSummary: string;
  filesSummary: string;
}

/**
 * Prompt template configuration
 */
export interface PromptTemplate {
  name: string;
  reportType: ReportType;
  template: string;
  description?: string;
  variables: string[];
}

/**
 * Interface for prompt management
 */
export interface PromptManager {
  /**
   * Get default prompt template for a report type
   */
  getDefaultTemplate(reportType: ReportType): PromptTemplate;

  /**
   * Get custom prompt template
   */
  getCustomTemplate(name: string): PromptTemplate | undefined;

  /**
   * Register a custom prompt template
   */
  registerTemplate(template: PromptTemplate): void;

  /**
   * Format a prompt with data
   */
  formatPrompt(template: string, data: CollectedData[]): string;

  /**
   * Generate prompt variables from collected data
   */
  generateVariables(data: CollectedData[]): PromptVariables;

  /**
   * Parse AI response into structured report
   */
  parseResponse(response: string, request: AIProcessingRequest): ProcessedReport;

  /**
   * Validate prompt template
   */
  validateTemplate(template: PromptTemplate): { isValid: boolean; errors: string[] };
}

/**
 * Default prompt templates for different report types
 */
export const DEFAULT_PROMPTS: Record<ReportType, PromptTemplate> = {
  daily: {
    name: 'default-daily',
    reportType: 'daily',
    template: `Generate a daily development report based on the following git commit data:

**Report Period:** {{dateRange}}
**Total Commits:** {{totalCommits}}
**Contributors:** {{authors}}
**Repositories:** {{repositories}}

**Commit Details:**
{{commitSummary}}

**Files Modified:**
{{filesSummary}}

Please create a structured report with the following sections:
1. **Summary** - Brief overview of the day's development activity
2. **Key Achievements** - Major features, fixes, or improvements completed
3. **Technical Details** - Important technical changes or decisions
4. **Files Modified** - Summary of file changes by category
5. **Next Steps** - Suggested follow-up actions or areas of focus

Format the response as JSON with this structure:
{
  "title": "Daily Development Report - [Date]",
  "summary": "Brief overview paragraph",
  "sections": [
    {
      "title": "Section Title",
      "content": "Section content in markdown format",
      "priority": 1
    }
  ]
}`,
    description: 'Default template for daily reports',
    variables: ['dateRange', 'totalCommits', 'authors', 'repositories', 'commitSummary', 'filesSummary']
  },

  weekly: {
    name: 'default-weekly',
    reportType: 'weekly',
    template: `Generate a weekly development report based on the following git commit data:

**Report Period:** {{dateRange}}
**Total Commits:** {{totalCommits}}
**Contributors:** {{authors}}
**Repositories:** {{repositories}}

**Commit Details:**
{{commitSummary}}

**Files Modified:**
{{filesSummary}}

Please create a comprehensive weekly report with the following sections:
1. **Executive Summary** - High-level overview of the week's progress
2. **Major Accomplishments** - Key features, milestones, and deliverables completed
3. **Technical Highlights** - Important architectural decisions, refactoring, or technical debt addressed
4. **Code Quality Metrics** - Analysis of code changes, test coverage, and quality improvements
5. **Collaboration Insights** - Team collaboration patterns and cross-functional work
6. **Challenges and Blockers** - Issues encountered and how they were resolved
7. **Upcoming Priorities** - Focus areas for the next week

Format the response as JSON with this structure:
{
  "title": "Weekly Development Report - [Date Range]",
  "summary": "Executive summary paragraph",
  "sections": [
    {
      "title": "Section Title",
      "content": "Section content in markdown format",
      "priority": 1
    }
  ]
}`,
    description: 'Default template for weekly reports',
    variables: ['dateRange', 'totalCommits', 'authors', 'repositories', 'commitSummary', 'filesSummary']
  },

  monthly: {
    name: 'default-monthly',
    reportType: 'monthly',
    template: `Generate a monthly development report based on the following git commit data:

**Report Period:** {{dateRange}}
**Total Commits:** {{totalCommits}}
**Contributors:** {{authors}}
**Repositories:** {{repositories}}

**Commit Details:**
{{commitSummary}}

**Files Modified:**
{{filesSummary}}

Please create a comprehensive monthly report with the following sections:
1. **Executive Summary** - Strategic overview of the month's development progress
2. **Major Milestones** - Key features, releases, and project completions
3. **Technical Evolution** - Architectural improvements, technology adoption, and system enhancements
4. **Development Metrics** - Productivity metrics, code quality trends, and team performance
5. **Innovation and Experimentation** - New technologies explored, prototypes built, and research conducted
6. **Team Collaboration** - Cross-team initiatives, knowledge sharing, and mentoring activities
7. **Quality and Reliability** - Bug fixes, performance improvements, and stability enhancements
8. **Strategic Initiatives** - Progress on long-term technical goals and roadmap items
9. **Lessons Learned** - Key insights, best practices discovered, and process improvements
10. **Future Outlook** - Priorities and focus areas for the upcoming month

Format the response as JSON with this structure:
{
  "title": "Monthly Development Report - [Month Year]",
  "summary": "Strategic summary paragraph",
  "sections": [
    {
      "title": "Section Title",
      "content": "Section content in markdown format",
      "priority": 1
    }
  ]
}`,
    description: 'Default template for monthly reports',
    variables: ['dateRange', 'totalCommits', 'authors', 'repositories', 'commitSummary', 'filesSummary']
  }
};

/**
 * Default implementation of prompt manager
 */
export class DefaultPromptManager implements PromptManager {
  private customTemplates = new Map<string, PromptTemplate>();

  constructor() {
    // Register default templates
    Object.values(DEFAULT_PROMPTS).forEach(template => {
      this.customTemplates.set(template.name, template);
    });
  }

  getDefaultTemplate(reportType: ReportType): PromptTemplate {
    return DEFAULT_PROMPTS[reportType];
  }

  getCustomTemplate(name: string): PromptTemplate | undefined {
    return this.customTemplates.get(name);
  }

  registerTemplate(template: PromptTemplate): void {
    const validation = this.validateTemplate(template);
    if (!validation.isValid) {
      throw new Error(`Invalid template: ${validation.errors.join(', ')}`);
    }
    this.customTemplates.set(template.name, template);
  }

  formatPrompt(template: string, data: CollectedData[]): string {
    const variables = this.generateVariables(data);
    
    let formattedPrompt = template;
    
    // Replace template variables
    Object.entries(variables).forEach(([key, value]) => {
      const placeholder = `{{${key}}}`;
      const stringValue = Array.isArray(value) ? value.join(', ') : String(value);
      formattedPrompt = formattedPrompt.replace(new RegExp(placeholder, 'g'), stringValue);
    });

    return formattedPrompt;
  }

  generateVariables(data: CollectedData[]): PromptVariables {
    if (data.length === 0) {
      throw new Error('No data provided for prompt generation');
    }

    // Aggregate all commits from all data sources
    const allCommits = data.flatMap(d => d.data);
    const timeRange = data[0].timeRange;
    
    // Extract unique authors
    const authors = [...new Set(allCommits.map(c => c.author))];
    
    // Extract unique repositories/sources
    const repositories = [...new Set(data.map(d => d.source))];
    
    // Format date range
    const dateRange = this.formatDateRange(timeRange);
    
    // Generate commit summary
    const commitSummary = this.generateCommitSummary(allCommits);
    
    // Generate files summary
    const filesSummary = this.generateFilesSummary(allCommits);

    return {
      reportType: timeRange.type,
      timeRange,
      commits: allCommits,
      totalCommits: allCommits.length,
      authors,
      repositories,
      dateRange,
      commitSummary,
      filesSummary
    };
  }

  parseResponse(response: string, request: AIProcessingRequest): ProcessedReport {
    try {
      // Try to parse as JSON first
      const parsed = JSON.parse(response);
      
      // Validate required fields
      if (!parsed.title || !parsed.summary || !Array.isArray(parsed.sections)) {
        throw new Error('Response missing required fields: title, summary, or sections');
      }

      // Validate sections structure
      for (const section of parsed.sections) {
        if (!section.title || !section.content) {
          throw new Error('Section missing required fields: title or content');
        }
        if (typeof section.priority !== 'number') {
          section.priority = 1; // Default priority
        }
      }

      // Create metadata
      const metadata = {
        generatedAt: new Date(),
        reportType: request.reportType,
        timeRange: request.timeRange,
        dataSourcesUsed: [...new Set(request.data.map(d => d.source))],
        aiProvider: '', // Will be set by the processor
        model: '', // Will be set by the processor
        processingTime: 0 // Will be set by the processor
      };

      return {
        title: parsed.title,
        summary: parsed.summary,
        sections: parsed.sections,
        metadata
      };
    } catch (error) {
      // If it's a validation error (not JSON parsing error), re-throw it
      if (error instanceof Error && error.message.includes('missing required fields')) {
        throw error;
      }
      
      // If JSON parsing fails, try to extract structured content from text
      return this.parseTextResponse(response, request);
    }
  }

  validateTemplate(template: PromptTemplate): { isValid: boolean; errors: string[] } {
    const errors: string[] = [];

    if (!template.name || template.name.trim() === '') {
      errors.push('Template name is required');
    }

    if (!template.template || template.template.trim() === '') {
      errors.push('Template content is required');
    }

    if (!['daily', 'weekly', 'monthly'].includes(template.reportType)) {
      errors.push('Invalid report type');
    }

    // Check for required variables in template
    const requiredVariables = ['dateRange', 'totalCommits', 'commitSummary'];
    const templateContent = template.template;
    
    for (const variable of requiredVariables) {
      if (!templateContent.includes(`{{${variable}}}`)) {
        errors.push(`Template missing required variable: ${variable}`);
      }
    }

    return {
      isValid: errors.length === 0,
      errors
    };
  }

  private formatDateRange(timeRange: TimeRange): string {
    const start = timeRange.start.toLocaleDateString();
    const end = timeRange.end.toLocaleDateString();
    
    if (start === end) {
      return start;
    }
    
    return `${start} to ${end}`;
  }

  private generateCommitSummary(commits: GitCommit[]): string {
    if (commits.length === 0) {
      return 'No commits found in the specified time range.';
    }

    const summary = commits.map(commit => {
      const date = commit.date.toLocaleDateString();
      const shortHash = commit.hash.substring(0, 8);
      const filesCount = commit.filesChanged.length;
      
      return `- **${date}** [${shortHash}] ${commit.author}: ${commit.message} (${filesCount} files, +${commit.additions}/-${commit.deletions})`;
    }).join('\n');

    return summary;
  }

  private generateFilesSummary(commits: GitCommit[]): string {
    if (commits.length === 0) {
      return 'No files modified.';
    }

    // Aggregate file changes
    const fileChanges = new Map<string, { count: number; additions: number; deletions: number }>();
    
    commits.forEach(commit => {
      commit.filesChanged.forEach(file => {
        const current = fileChanges.get(file) || { count: 0, additions: 0, deletions: 0 };
        fileChanges.set(file, {
          count: current.count + 1,
          additions: current.additions + commit.additions,
          deletions: current.deletions + commit.deletions
        });
      });
    });

    // If no files were changed across all commits
    if (fileChanges.size === 0) {
      return 'No files modified.';
    }

    // Group by file extension
    const extensionGroups = new Map<string, string[]>();
    
    fileChanges.forEach((stats, file) => {
      const extension = file.split('.').pop() || 'no-extension';
      const files = extensionGroups.get(extension) || [];
      files.push(`${file} (${stats.count} changes)`);
      extensionGroups.set(extension, files);
    });

    // Format summary
    const summary = Array.from(extensionGroups.entries())
      .map(([ext, files]) => `**${ext.toUpperCase()} files:** ${files.join(', ')}`)
      .join('\n');

    return summary;
  }

  private parseTextResponse(response: string, request: AIProcessingRequest): ProcessedReport {
    // Fallback parser for non-JSON responses
    const lines = response.split('\n').filter(line => line.trim());
    
    let title = `${request.reportType.charAt(0).toUpperCase() + request.reportType.slice(1)} Report`;
    let summary = 'AI-generated report based on git commit analysis.';
    const sections = [];

    // Try to extract title (look for lines that start with # or are short and contain "report")
    const titleMatch = lines.find(line => 
      (line.startsWith('#') || line.length < 50) && 
      line.toLowerCase().includes('report')
    );
    if (titleMatch) {
      title = titleMatch.replace(/^#+\s*/, '').trim();
    }

    // Try to extract summary (first substantial paragraph that's not the entire response)
    const summaryMatch = lines.find(line => line.length > 50 && !line.startsWith('#') && line !== response.trim());
    if (summaryMatch) {
      summary = summaryMatch.trim();
    }

    // Create a single section with the full response
    sections.push({
      title: 'Report Content',
      content: response,
      priority: 1
    });

    const metadata = {
      generatedAt: new Date(),
      reportType: request.reportType,
      timeRange: request.timeRange,
      dataSourcesUsed: [...new Set(request.data.map(d => d.source))],
      aiProvider: '',
      model: '',
      processingTime: 0
    };

    return {
      title,
      summary,
      sections,
      metadata
    };
  }
}