// Unit tests for MarkdownFormatter

import { describe, it, expect, beforeEach } from 'vitest';
import { MarkdownFormatter } from '../markdown-formatter';
import { ProcessedReport, ReportSection, ReportMetadata } from '../../../models/ai';
import { OutputConfiguration, ReportType } from '../../../models/config';

describe('MarkdownFormatter', () => {
  let formatter: MarkdownFormatter;
  let mockOutputConfig: OutputConfiguration;
  let mockReport: ProcessedReport;

  beforeEach(() => {
    formatter = new MarkdownFormatter();
    
    mockOutputConfig = {
      format: 'markdown',
      outputPath: './reports',
      filename: 'test-report.md',
      includeMetadata: true
    };

    const mockMetadata: ReportMetadata = {
      generatedAt: new Date('2024-01-15T10:30:00Z'),
      reportType: 'daily' as ReportType,
      timeRange: {
        start: new Date('2024-01-14T00:00:00Z'),
        end: new Date('2024-01-15T00:00:00Z'),
        type: 'daily' as ReportType
      },
      dataSourcesUsed: ['git-repo-1', 'git-repo-2'],
      aiProvider: 'openai',
      model: 'gpt-4',
      processingTime: 1500
    };

    mockReport = {
      title: 'Daily Development Report',
      summary: 'Summary of development activities for the day.',
      sections: [
        {
          title: 'Code Changes',
          content: 'Multiple commits were made to improve functionality.',
          priority: 1
        },
        {
          title: 'Bug Fixes',
          content: 'Fixed critical issues in the authentication module.',
          priority: 2
        }
      ],
      metadata: mockMetadata
    };
  });

  describe('format', () => {
    it('should format a basic report correctly', () => {
      const result = formatter.format(mockReport, mockOutputConfig);
      
      expect(result).toContain('# Daily Development Report');
      expect(result).toContain('## Summary');
      expect(result).toContain('Summary of development activities for the day.');
      expect(result).toContain('## Code Changes');
      expect(result).toContain('Multiple commits were made to improve functionality.');
      expect(result).toContain('## Bug Fixes');
      expect(result).toContain('Fixed critical issues in the authentication module.');
    });

    it('should include metadata when enabled', () => {
      const result = formatter.format(mockReport, mockOutputConfig);
      
      expect(result).toContain('## Report Metadata');
      expect(result).toContain('**Generated At:** 2024-01-15T10:30:00.000Z');
      expect(result).toContain('**Report Type:** daily');
      expect(result).toContain('**AI Provider:** openai');
      expect(result).toContain('**Model:** gpt-4');
      expect(result).toContain('**Processing Time:** 1500ms');
      expect(result).toContain('**Data Sources:** git-repo-1, git-repo-2');
    });

    it('should exclude metadata when disabled', () => {
      const configWithoutMetadata = { ...mockOutputConfig, includeMetadata: false };
      const result = formatter.format(mockReport, configWithoutMetadata);
      
      expect(result).not.toContain('## Report Metadata');
      expect(result).not.toContain('**Generated At:**');
    });

    it('should sort sections by priority', () => {
      const reportWithMixedPriorities: ProcessedReport = {
        ...mockReport,
        sections: [
          { title: 'Low Priority', content: 'Low priority content', priority: 3 },
          { title: 'High Priority', content: 'High priority content', priority: 1 },
          { title: 'Medium Priority', content: 'Medium priority content', priority: 2 }
        ]
      };

      const result = formatter.format(reportWithMixedPriorities, mockOutputConfig);
      
      const highPriorityIndex = result.indexOf('## High Priority');
      const mediumPriorityIndex = result.indexOf('## Medium Priority');
      const lowPriorityIndex = result.indexOf('## Low Priority');
      
      expect(highPriorityIndex).toBeLessThan(mediumPriorityIndex);
      expect(mediumPriorityIndex).toBeLessThan(lowPriorityIndex);
    });

    it('should handle empty summary', () => {
      const reportWithoutSummary = { ...mockReport, summary: '' };
      const result = formatter.format(reportWithoutSummary, mockOutputConfig);
      
      expect(result).not.toContain('## Summary');
      expect(result).toContain('# Daily Development Report');
      expect(result).toContain('## Code Changes');
    });

    it('should handle empty sections array', () => {
      const reportWithoutSections = { ...mockReport, sections: [] };
      const result = formatter.format(reportWithoutSections, mockOutputConfig);
      
      expect(result).toContain('# Daily Development Report');
      expect(result).toContain('## Summary');
      expect(result).not.toContain('## Code Changes');
    });
  });

  describe('formatContent', () => {
    it('should preserve existing code blocks', () => {
      const reportWithCodeBlocks: ProcessedReport = {
        ...mockReport,
        sections: [{
          title: 'Code Example',
          content: 'Here is some code:\n\n```javascript\nfunction test() {\n  return "hello";\n}\n```\n\nEnd of example.',
          priority: 1
        }]
      };

      const result = formatter.format(reportWithCodeBlocks, mockOutputConfig);
      
      expect(result).toContain('```javascript\nfunction test() {\n  return "hello";\n}\n```');
    });

    it('should preserve existing inline code', () => {
      const reportWithInlineCode: ProcessedReport = {
        ...mockReport,
        sections: [{
          title: 'Inline Code',
          content: 'The `console.log()` function is useful for debugging.',
          priority: 1
        }]
      };

      const result = formatter.format(reportWithInlineCode, mockOutputConfig);
      
      expect(result).toContain('The `console.log()` function is useful for debugging.');
    });

    it('should format git hashes as inline code', () => {
      const reportWithGitHashes: ProcessedReport = {
        ...mockReport,
        sections: [{
          title: 'Commits',
          content: 'Commit abc1234 fixed the bug. Another commit def5678901234567890 added features.',
          priority: 1
        }]
      };

      const result = formatter.format(reportWithGitHashes, mockOutputConfig);
      
      expect(result).toContain('Commit `abc1234` fixed the bug');
      expect(result).toContain('Another commit `def5678901234567890` added features');
    });

    it('should format file paths as inline code', () => {
      const reportWithFilePaths: ProcessedReport = {
        ...mockReport,
        sections: [{
          title: 'Files Changed',
          content: 'Modified src/components/Button.tsx and updated package.json configuration.',
          priority: 1
        }]
      };

      const result = formatter.format(reportWithFilePaths, mockOutputConfig);
      
      expect(result).toContain('Modified `src/components/Button.tsx`');
      expect(result).toContain('updated `package.json`');
    });

    it('should handle mixed content with code blocks and inline code', () => {
      const reportWithMixedContent: ProcessedReport = {
        ...mockReport,
        sections: [{
          title: 'Mixed Content',
          content: 'Updated `config.js` with new settings:\n\n```json\n{\n  "debug": true\n}\n```\n\nCommit abc1234 contains these changes.',
          priority: 1
        }]
      };

      const result = formatter.format(reportWithMixedContent, mockOutputConfig);
      
      expect(result).toContain('Updated `config.js`');
      expect(result).toContain('```json\n{\n  "debug": true\n}\n```');
      expect(result).toContain('Commit `abc1234`');
    });
  });

  describe('escapeMarkdown', () => {
    it('should escape special markdown characters', () => {
      const reportWithSpecialChars: ProcessedReport = {
        ...mockReport,
        title: 'Report with *special* characters & [brackets]',
        sections: [{
          title: 'Section with _underscores_ and #hashtags',
          content: 'Content with **bold** and `code` formatting.',
          priority: 1
        }]
      };

      const result = formatter.format(reportWithSpecialChars, mockOutputConfig);
      
      expect(result).toContain('# Report with \\*special\\* characters & \\[brackets\\]');
      expect(result).toContain('## Section with \\_underscores\\_ and \\#hashtags');
    });

    it('should handle empty or null text', () => {
      const reportWithEmptyTitle: ProcessedReport = {
        ...mockReport,
        title: '',
        sections: [{
          title: 'Valid Section',
          content: 'Valid content',
          priority: 1
        }]
      };

      const result = formatter.format(reportWithEmptyTitle, mockOutputConfig);
      
      expect(result).toContain('# ');
      expect(result).toContain('## Valid Section');
    });
  });

  describe('validateMarkdown', () => {
    it('should validate well-formed markdown', () => {
      const validMarkdown = '# Title\n\n## Section\n\nSome content with `inline code` and:\n\n```javascript\ncode block\n```';
      
      const result = formatter.validateMarkdown(validMarkdown);
      
      // Debug the validation result
      if (!result.isValid) {
        console.log('Validation errors:', result.errors);
      }
      
      expect(result.isValid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should detect unmatched code blocks', () => {
      const invalidMarkdown = '# Title\n\n```javascript\ncode block without closing';
      
      const result = formatter.validateMarkdown(invalidMarkdown);
      
      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('Unmatched code block delimiters (```)');
    });

    it('should detect unmatched inline code', () => {
      const invalidMarkdown = '# Title\n\nSome `unclosed inline code';
      
      const result = formatter.validateMarkdown(invalidMarkdown);
      
      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('Unmatched inline code delimiters (`)');
    });

    it('should detect invalid heading format', () => {
      const invalidMarkdown = '#Title without space\n\n##Another invalid heading';
      
      const result = formatter.validateMarkdown(invalidMarkdown);
      
      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('Invalid heading format - headings should have space after #');
    });

    it('should handle escaped backticks correctly', () => {
      const markdownWithEscapedBackticks = 'Use \\`backticks\\` to create `inline code`.';
      
      const result = formatter.validateMarkdown(markdownWithEscapedBackticks);
      
      expect(result.isValid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should handle multiple validation errors', () => {
      const invalidMarkdown = '#Invalid heading\n\n```unclosed code block\n\nSome `unclosed inline code';
      
      const result = formatter.validateMarkdown(invalidMarkdown);
      
      expect(result.isValid).toBe(false);
      expect(result.errors.length).toBeGreaterThanOrEqual(2);
      expect(result.errors).toContain('Invalid heading format - headings should have space after #');
      expect(result.errors).toContain('Unmatched code block delimiters (```)');
      // Note: inline code validation might not trigger due to the unclosed code block
    });
  });

  describe('edge cases', () => {
    it('should handle report with no sections', () => {
      const emptyReport: ProcessedReport = {
        title: 'Empty Report',
        summary: 'This report has no sections',
        sections: [],
        metadata: mockReport.metadata
      };

      const result = formatter.format(emptyReport, mockOutputConfig);
      
      expect(result).toContain('# Empty Report');
      expect(result).toContain('## Summary');
      expect(result).toContain('This report has no sections');
      expect(result).toContain('## Report Metadata');
    });

    it('should handle sections with empty content', () => {
      const reportWithEmptySection: ProcessedReport = {
        ...mockReport,
        sections: [{
          title: 'Empty Section',
          content: '',
          priority: 1
        }]
      };

      const result = formatter.format(reportWithEmptySection, mockOutputConfig);
      
      expect(result).toContain('## Empty Section');
      // Should have proper formatting for empty content (heading with triple newline due to section joining)
      expect(result).toContain('## Empty Section\n\n\n## Report Metadata');
    });

    it('should handle very long content', () => {
      const longContent = 'A'.repeat(10000);
      const reportWithLongContent: ProcessedReport = {
        ...mockReport,
        sections: [{
          title: 'Long Section',
          content: longContent,
          priority: 1
        }]
      };

      const result = formatter.format(reportWithLongContent, mockOutputConfig);
      
      expect(result).toContain('## Long Section');
      expect(result).toContain(longContent);
    });

    it('should handle special unicode characters', () => {
      const reportWithUnicode: ProcessedReport = {
        ...mockReport,
        title: 'Report with émojis 🚀 and ünïcödé',
        sections: [{
          title: 'Unicode Section 📊',
          content: 'Content with various characters: αβγ, 中文, العربية',
          priority: 1
        }]
      };

      const result = formatter.format(reportWithUnicode, mockOutputConfig);
      
      expect(result).toContain('# Report with émojis 🚀 and ünïcödé');
      expect(result).toContain('## Unicode Section 📊');
      expect(result).toContain('Content with various characters: αβγ, 中文, العربية');
    });
  });
});