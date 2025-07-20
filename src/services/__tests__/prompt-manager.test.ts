// Tests for prompt management and processing

import { describe, it, expect, beforeEach } from 'vitest';
import {
  DefaultPromptManager,
  DEFAULT_PROMPTS,
  PromptTemplate
} from '../prompt-manager';
import { CollectedData, GitCommit, TimeRange, ReportType } from '../../models/config';
import { AIProcessingRequest } from '../../models/ai';

describe('DefaultPromptManager', () => {
  let promptManager: DefaultPromptManager;
  let mockCollectedData: CollectedData[];
  let mockTimeRange: TimeRange;

  beforeEach(() => {
    promptManager = new DefaultPromptManager();
    
    mockTimeRange = {
      start: new Date('2024-01-01'),
      end: new Date('2024-01-07'),
      type: 'weekly'
    };

    const mockCommits: GitCommit[] = [
      {
        hash: 'abc123def456',
        author: 'John Doe',
        date: new Date('2024-01-02'),
        message: 'Add user authentication feature',
        filesChanged: ['src/auth.ts', 'src/types.ts'],
        additions: 150,
        deletions: 20
      },
      {
        hash: 'def456ghi789',
        author: 'Jane Smith',
        date: new Date('2024-01-03'),
        message: 'Fix login validation bug',
        filesChanged: ['src/auth.ts', 'tests/auth.test.ts'],
        additions: 25,
        deletions: 10
      },
      {
        hash: 'ghi789jkl012',
        author: 'John Doe',
        date: new Date('2024-01-05'),
        message: 'Update documentation',
        filesChanged: ['README.md', 'docs/api.md'],
        additions: 80,
        deletions: 5
      }
    ];

    mockCollectedData = [
      {
        source: 'test-repo',
        timeRange: mockTimeRange,
        data: mockCommits
      }
    ];
  });

  describe('Default Templates', () => {
    it('should provide default templates for all report types', () => {
      const dailyTemplate = promptManager.getDefaultTemplate('daily');
      const weeklyTemplate = promptManager.getDefaultTemplate('weekly');
      const monthlyTemplate = promptManager.getDefaultTemplate('monthly');

      expect(dailyTemplate).toBeDefined();
      expect(dailyTemplate.reportType).toBe('daily');
      expect(dailyTemplate.template).toContain('daily development report');

      expect(weeklyTemplate).toBeDefined();
      expect(weeklyTemplate.reportType).toBe('weekly');
      expect(weeklyTemplate.template).toContain('weekly development report');

      expect(monthlyTemplate).toBeDefined();
      expect(monthlyTemplate.reportType).toBe('monthly');
      expect(monthlyTemplate.template).toContain('monthly development report');
    });

    it('should have all required variables in default templates', () => {
      const requiredVariables = ['dateRange', 'totalCommits', 'commitSummary'];
      
      Object.values(DEFAULT_PROMPTS).forEach(template => {
        requiredVariables.forEach(variable => {
          expect(template.template).toContain(`{{${variable}}}`);
        });
      });
    });
  });

  describe('Custom Template Management', () => {
    it('should register and retrieve custom templates', () => {
      const customTemplate: PromptTemplate = {
        name: 'custom-daily',
        reportType: 'daily',
        template: 'Custom template with {{dateRange}}, {{totalCommits}}, and {{commitSummary}}',
        description: 'Custom daily template',
        variables: ['dateRange', 'totalCommits', 'commitSummary']
      };

      promptManager.registerTemplate(customTemplate);
      const retrieved = promptManager.getCustomTemplate('custom-daily');

      expect(retrieved).toEqual(customTemplate);
    });

    it('should return undefined for non-existent custom templates', () => {
      const result = promptManager.getCustomTemplate('non-existent');
      expect(result).toBeUndefined();
    });

    it('should validate templates before registration', () => {
      const invalidTemplate: PromptTemplate = {
        name: '',
        reportType: 'daily',
        template: 'Missing required variables',
        variables: []
      };

      expect(() => {
        promptManager.registerTemplate(invalidTemplate);
      }).toThrow('Invalid template');
    });
  });

  describe('Template Validation', () => {
    it('should validate valid templates', () => {
      const validTemplate: PromptTemplate = {
        name: 'valid-template',
        reportType: 'daily',
        template: 'Valid template with {{dateRange}}, {{totalCommits}}, and {{commitSummary}}',
        variables: ['dateRange', 'totalCommits', 'commitSummary']
      };

      const result = promptManager.validateTemplate(validTemplate);
      expect(result.isValid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should reject templates with missing name', () => {
      const invalidTemplate: PromptTemplate = {
        name: '',
        reportType: 'daily',
        template: 'Template with {{dateRange}}, {{totalCommits}}, and {{commitSummary}}',
        variables: []
      };

      const result = promptManager.validateTemplate(invalidTemplate);
      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('Template name is required');
    });

    it('should reject templates with missing content', () => {
      const invalidTemplate: PromptTemplate = {
        name: 'test-template',
        reportType: 'daily',
        template: '',
        variables: []
      };

      const result = promptManager.validateTemplate(invalidTemplate);
      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('Template content is required');
    });

    it('should reject templates with invalid report type', () => {
      const invalidTemplate: PromptTemplate = {
        name: 'test-template',
        reportType: 'invalid' as ReportType,
        template: 'Template with {{dateRange}}, {{totalCommits}}, and {{commitSummary}}',
        variables: []
      };

      const result = promptManager.validateTemplate(invalidTemplate);
      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('Invalid report type');
    });

    it('should reject templates missing required variables', () => {
      const invalidTemplate: PromptTemplate = {
        name: 'test-template',
        reportType: 'daily',
        template: 'Template missing required variables',
        variables: []
      };

      const result = promptManager.validateTemplate(invalidTemplate);
      expect(result.isValid).toBe(false);
      expect(result.errors.some(error => error.includes('missing required variable'))).toBe(true);
    });
  });

  describe('Variable Generation', () => {
    it('should generate variables from collected data', () => {
      const variables = promptManager.generateVariables(mockCollectedData);

      expect(variables.reportType).toBe('weekly');
      expect(variables.totalCommits).toBe(3);
      expect(variables.authors).toEqual(['John Doe', 'Jane Smith']);
      expect(variables.repositories).toEqual(['test-repo']);
      expect(variables.dateRange).toBe('2024/1/1 to 2024/1/7');
      expect(variables.commitSummary).toContain('John Doe');
      expect(variables.commitSummary).toContain('Add user authentication feature');
      expect(variables.filesSummary).toContain('TS files');
    });

    it('should handle empty data gracefully', () => {
      expect(() => {
        promptManager.generateVariables([]);
      }).toThrow('No data provided for prompt generation');
    });

    it('should aggregate data from multiple sources', () => {
      const additionalData: CollectedData = {
        source: 'another-repo',
        timeRange: mockTimeRange,
        data: [
          {
            hash: 'xyz789abc123',
            author: 'Bob Wilson',
            date: new Date('2024-01-04'),
            message: 'Refactor database layer',
            filesChanged: ['src/db.ts'],
            additions: 100,
            deletions: 50
          }
        ]
      };

      const multiSourceData = [...mockCollectedData, additionalData];
      const variables = promptManager.generateVariables(multiSourceData);

      expect(variables.totalCommits).toBe(4);
      expect(variables.authors).toContain('Bob Wilson');
      expect(variables.repositories).toEqual(['test-repo', 'another-repo']);
    });
  });

  describe('Prompt Formatting', () => {
    it('should format prompts with variable substitution', () => {
      const template = 'Report for {{dateRange}} with {{totalCommits}} commits from {{authors}}';
      const formatted = promptManager.formatPrompt(template, mockCollectedData);

      expect(formatted).toContain('2024/1/1 to 2024/1/7');
      expect(formatted).toContain('3 commits');
      expect(formatted).toContain('John Doe, Jane Smith');
    });

    it('should handle templates with no variables', () => {
      const template = 'Static template with no variables';
      const formatted = promptManager.formatPrompt(template, mockCollectedData);

      expect(formatted).toBe(template);
    });

    it('should handle missing variables gracefully', () => {
      const template = 'Template with {{nonExistentVariable}}';
      const formatted = promptManager.formatPrompt(template, mockCollectedData);

      expect(formatted).toContain('{{nonExistentVariable}}'); // Should remain unchanged
    });
  });

  describe('Response Parsing', () => {
    let mockRequest: AIProcessingRequest;

    beforeEach(() => {
      mockRequest = {
        data: mockCollectedData,
        prompt: 'Test prompt',
        reportType: 'weekly',
        timeRange: mockTimeRange
      };
    });

    it('should parse valid JSON responses', () => {
      const jsonResponse = JSON.stringify({
        title: 'Weekly Development Report',
        summary: 'This week focused on authentication features',
        sections: [
          {
            title: 'Key Achievements',
            content: 'Implemented user authentication',
            priority: 1
          }
        ]
      });

      const result = promptManager.parseResponse(jsonResponse, mockRequest);

      expect(result.title).toBe('Weekly Development Report');
      expect(result.summary).toBe('This week focused on authentication features');
      expect(result.sections).toHaveLength(1);
      expect(result.sections[0].title).toBe('Key Achievements');
      expect(result.metadata.reportType).toBe('weekly');
    });

    it('should handle malformed JSON by falling back to text parsing', () => {
      const textResponse = 'This is a plain text response about the weekly report.';
      const result = promptManager.parseResponse(textResponse, mockRequest);

      expect(result.title).toBe('Weekly Report');
      expect(result.summary).toBe('AI-generated report based on git commit analysis.');
      expect(result.sections).toHaveLength(1);
      expect(result.sections[0].content).toBe(textResponse);
    });

    it('should validate JSON response structure', () => {
      const invalidJsonResponse = JSON.stringify({
        title: 'Valid Title',
        // Missing summary and sections
      });

      expect(() => {
        promptManager.parseResponse(invalidJsonResponse, mockRequest);
      }).toThrow('Response missing required fields');
    });

    it('should set default priority for sections missing priority', () => {
      const jsonResponse = JSON.stringify({
        title: 'Test Report',
        summary: 'Test summary',
        sections: [
          {
            title: 'Section 1',
            content: 'Content 1'
            // Missing priority
          }
        ]
      });

      const result = promptManager.parseResponse(jsonResponse, mockRequest);
      expect(result.sections[0].priority).toBe(1);
    });

    it('should validate section structure', () => {
      const invalidJsonResponse = JSON.stringify({
        title: 'Test Report',
        summary: 'Test summary',
        sections: [
          {
            // Missing title and content
            priority: 1
          }
        ]
      });

      expect(() => {
        promptManager.parseResponse(invalidJsonResponse, mockRequest);
      }).toThrow('Section missing required fields');
    });
  });

  describe('Date and Summary Formatting', () => {
    it('should format single day date ranges', () => {
      const singleDayRange: TimeRange = {
        start: new Date('2024-01-01'),
        end: new Date('2024-01-01'),
        type: 'daily'
      };

      const singleDayData: CollectedData[] = [{
        source: 'test',
        timeRange: singleDayRange,
        data: []
      }];

      const variables = promptManager.generateVariables(singleDayData);
      expect(variables.dateRange).toBe('2024/1/1');
    });

    it('should generate detailed commit summaries', () => {
      const variables = promptManager.generateVariables(mockCollectedData);
      
      expect(variables.commitSummary).toContain('abc123de');
      expect(variables.commitSummary).toContain('John Doe');
      expect(variables.commitSummary).toContain('Add user authentication feature');
      expect(variables.commitSummary).toContain('+150/-20');
    });

    it('should group files by extension in summary', () => {
      const variables = promptManager.generateVariables(mockCollectedData);
      
      expect(variables.filesSummary).toContain('TS files');
      expect(variables.filesSummary).toContain('MD files');
      expect(variables.filesSummary).toContain('src/auth.ts');
    });

    it('should handle commits with no files changed', () => {
      const noFilesData: CollectedData[] = [{
        source: 'test',
        timeRange: mockTimeRange,
        data: [{
          hash: 'abc123',
          author: 'Test Author',
          date: new Date(),
          message: 'Empty commit',
          filesChanged: [],
          additions: 0,
          deletions: 0
        }]
      }];

      const variables = promptManager.generateVariables(noFilesData);
      expect(variables.filesSummary).toBe('No files modified.');
    });
  });
});