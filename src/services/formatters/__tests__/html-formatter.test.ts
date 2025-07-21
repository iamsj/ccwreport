// Unit tests for HTMLFormatter

import { describe, it, expect, beforeEach } from 'vitest';
import { HTMLFormatter } from '../html-formatter';
import { ProcessedReport, ReportSection, ReportMetadata } from '../../../models/ai';
import { OutputConfiguration, ReportType } from '../../../models/config';

describe('HTMLFormatter', () => {
  let formatter: HTMLFormatter;
  let mockOutputConfig: OutputConfiguration;
  let mockReport: ProcessedReport;

  beforeEach(() => {
    formatter = new HTMLFormatter();
    
    mockOutputConfig = {
      format: 'html',
      outputPath: './reports',
      filename: 'test-report.html',
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
    it('should generate valid HTML document structure', () => {
      const result = formatter.format(mockReport, mockOutputConfig);
      
      expect(result).toContain('<!DOCTYPE html>');
      expect(result).toContain('<html lang="en">');
      expect(result).toContain('<head>');
      expect(result).toContain('<meta charset="UTF-8">');
      expect(result).toContain('<title>Daily Development Report</title>');
      expect(result).toContain('<style>');
      expect(result).toContain('</head>');
      expect(result).toContain('<body>');
      expect(result).toContain('</body>');
      expect(result).toContain('</html>');
    });

    it('should format a basic report correctly', () => {
      const result = formatter.format(mockReport, mockOutputConfig);
      
      expect(result).toContain('<h1 class="report-title">Daily Development Report</h1>');
      expect(result).toContain('<section class="report-summary">');
      expect(result).toContain('<h2>Summary</h2>');
      expect(result).toContain('Summary of development activities for the day.');
      expect(result).toContain('<section class="report-section">');
      expect(result).toContain('<h2>Code Changes</h2>');
      expect(result).toContain('Multiple commits were made to improve functionality.');
      expect(result).toContain('<h2>Bug Fixes</h2>');
      expect(result).toContain('Fixed critical issues in the authentication module.');
    });

    it('should include metadata when enabled', () => {
      const result = formatter.format(mockReport, mockOutputConfig);
      
      expect(result).toContain('<section class="metadata-section">');
      expect(result).toContain('<h2>Report Metadata</h2>');
      expect(result).toContain('Generated At');
      expect(result).toContain('2024-01-15T10:30:00.000Z');
      expect(result).toContain('Report Type');
      expect(result).toContain('daily');
      expect(result).toContain('AI Provider');
      expect(result).toContain('openai');
      expect(result).toContain('Model');
      expect(result).toContain('gpt-4');
      expect(result).toContain('Processing Time');
      expect(result).toContain('1500ms');
      expect(result).toContain('Data Sources');
      expect(result).toContain('git-repo-1, git-repo-2');
    });

    it('should exclude metadata when disabled', () => {
      const configWithoutMetadata = { ...mockOutputConfig, includeMetadata: false };
      const result = formatter.format(mockReport, configWithoutMetadata);
      
      expect(result).not.toContain('<section class="metadata-section">');
      expect(result).not.toContain('Report Metadata');
      expect(result).not.toContain('Generated At');
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
      
      const highPriorityIndex = result.indexOf('<h2>High Priority</h2>');
      const mediumPriorityIndex = result.indexOf('<h2>Medium Priority</h2>');
      const lowPriorityIndex = result.indexOf('<h2>Low Priority</h2>');
      
      expect(highPriorityIndex).toBeLessThan(mediumPriorityIndex);
      expect(mediumPriorityIndex).toBeLessThan(lowPriorityIndex);
    });

    it('should handle empty summary', () => {
      const reportWithoutSummary = { ...mockReport, summary: '' };
      const result = formatter.format(reportWithoutSummary, mockOutputConfig);
      
      expect(result).not.toContain('<section class="report-summary">');
      expect(result).not.toContain('<h2>Summary</h2>');
      expect(result).toContain('<h1 class="report-title">Daily Development Report</h1>');
      expect(result).toContain('<h2>Code Changes</h2>');
    });

    it('should handle empty sections array', () => {
      const reportWithoutSections = { ...mockReport, sections: [] };
      const result = formatter.format(reportWithoutSections, mockOutputConfig);
      
      expect(result).toContain('<h1 class="report-title">Daily Development Report</h1>');
      expect(result).toContain('<section class="report-summary">');
      expect(result).not.toContain('<h2>Code Changes</h2>');
    });

    it('should include custom CSS when provided', () => {
      const configWithCustomCSS = {
        ...mockOutputConfig,
        styling: {
          customCss: '.custom-style { color: red; }'
        }
      };
      
      const result = formatter.format(mockReport, configWithCustomCSS);
      
      expect(result).toContain('/* Custom CSS */');
      expect(result).toContain('.custom-style { color: red; }');
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
      
      expect(result).toContain('<pre class="code-block language-javascript">');
      expect(result).toContain('<code>function test() {\n  return &quot;hello&quot;;\n}</code>');
      expect(result).toContain('</pre>');
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
      
      expect(result).toContain('<code class="code-inline">console.log()</code>');
    });

    it('should format git hashes as commit spans', () => {
      const reportWithGitHashes: ProcessedReport = {
        ...mockReport,
        sections: [{
          title: 'Commits',
          content: 'Commit abc1234 fixed the bug. Another commit def5678901234567890 added features.',
          priority: 1
        }]
      };

      const result = formatter.format(reportWithGitHashes, mockOutputConfig);
      
      expect(result).toContain('<span class="commit-hash">abc1234</span>');
      expect(result).toContain('<span class="commit-hash">def5678901234567890</span>');
    });

    it('should format file paths as file spans', () => {
      const reportWithFilePaths: ProcessedReport = {
        ...mockReport,
        sections: [{
          title: 'Files Changed',
          content: 'Modified src/components/Button.tsx and updated package.json configuration.',
          priority: 1
        }]
      };

      const result = formatter.format(reportWithFilePaths, mockOutputConfig);
      
      expect(result).toContain('<span class="file-path">src/components/Button.tsx</span>');
      expect(result).toContain('<span class="file-path">package.json</span>');
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
      
      expect(result).toContain('<code class="code-inline">config.js</code>');
      expect(result).toContain('<pre class="code-block language-json">');
      expect(result).toContain('<span class="commit-hash">abc1234</span>');
    });

    it('should convert line breaks to paragraphs', () => {
      const reportWithParagraphs: ProcessedReport = {
        ...mockReport,
        sections: [{
          title: 'Multiple Paragraphs',
          content: 'First paragraph.\n\nSecond paragraph with more content.\n\nThird paragraph.',
          priority: 1
        }]
      };

      const result = formatter.format(reportWithParagraphs, mockOutputConfig);
      
      expect(result).toContain('<p>First paragraph.</p>');
      expect(result).toContain('<p>Second paragraph with more content.</p>');
      expect(result).toContain('<p>Third paragraph.</p>');
    });

    it('should handle single line breaks as <br> tags', () => {
      const reportWithLineBreaks: ProcessedReport = {
        ...mockReport,
        sections: [{
          title: 'Line Breaks',
          content: 'Line one\nLine two\nLine three',
          priority: 1
        }]
      };

      const result = formatter.format(reportWithLineBreaks, mockOutputConfig);
      
      expect(result).toContain('Line one<br>Line two<br>Line three');
    });
  });

  describe('escapeHtml', () => {
    it('should escape HTML special characters', () => {
      const reportWithSpecialChars: ProcessedReport = {
        ...mockReport,
        title: 'Report with <script> & "quotes"',
        sections: [{
          title: 'Section with <tags> & entities',
          content: 'Content with <b>bold</b> and "quotes" & ampersands.',
          priority: 1
        }]
      };

      const result = formatter.format(reportWithSpecialChars, mockOutputConfig);
      
      expect(result).toContain('<title>Report with &lt;script&gt; &amp; &quot;quotes&quot;</title>');
      expect(result).toContain('<h1 class="report-title">Report with &lt;script&gt; &amp; &quot;quotes&quot;</h1>');
      expect(result).toContain('<h2>Section with &lt;tags&gt; &amp; entities</h2>');
      expect(result).toContain('Content with &lt;b&gt;bold&lt;&#x2F;b&gt; and &quot;quotes&quot; &amp; ampersands.');
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
      
      expect(result).toContain('<title></title>');
      expect(result).toContain('<h1 class="report-title"></h1>');
      expect(result).toContain('<h2>Valid Section</h2>');
    });
  });

  describe('validateHtml', () => {
    it('should validate well-formed HTML', () => {
      const validHtml = formatter.format(mockReport, mockOutputConfig);
      
      const result = formatter.validateHtml(validHtml);
      
      expect(result.isValid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should detect missing DOCTYPE', () => {
      const invalidHtml = '<html><head><title>Test</title></head><body><h1>Test</h1></body></html>';
      
      const result = formatter.validateHtml(invalidHtml);
      
      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('Missing DOCTYPE declaration');
    });

    it('should detect missing html tags', () => {
      const invalidHtml = '<!DOCTYPE html><head><title>Test</title></head><body><h1>Test</h1></body>';
      
      const result = formatter.validateHtml(invalidHtml);
      
      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('Missing html tags');
    });

    it('should detect missing head section', () => {
      const invalidHtml = '<!DOCTYPE html><html><body><h1>Test</h1></body></html>';
      
      const result = formatter.validateHtml(invalidHtml);
      
      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('Missing head section');
    });

    it('should detect missing body section', () => {
      const invalidHtml = '<!DOCTYPE html><html><head><title>Test</title></head></html>';
      
      const result = formatter.validateHtml(invalidHtml);
      
      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('Missing body section');
    });

    it('should detect unmatched tags', () => {
      const invalidHtml = '<!DOCTYPE html><html><head><title>Test</title></head><body><h1>Test<h2>Unclosed</body></html>';
      
      const result = formatter.validateHtml(invalidHtml);
      
      expect(result.isValid).toBe(false);
      expect(result.errors.some(error => error.includes('Unmatched') || error.includes('Unclosed'))).toBe(true);
    });

    it('should handle self-closing tags correctly', () => {
      const htmlWithSelfClosing = '<!DOCTYPE html><html><head><meta charset="UTF-8"><title>Test</title></head><body><h1>Test</h1><br><hr></body></html>';
      
      const result = formatter.validateHtml(htmlWithSelfClosing);
      
      expect(result.isValid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should handle multiple validation errors', () => {
      const invalidHtml = '<head><title>Test</title></head><h1>Test<h2>Unclosed';
      
      const result = formatter.validateHtml(invalidHtml);
      
      expect(result.isValid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(1);
    });
  });

  describe('CSS generation', () => {
    it('should include responsive design styles', () => {
      const result = formatter.format(mockReport, mockOutputConfig);
      
      expect(result).toContain('@media (max-width: 768px)');
      expect(result).toContain('@media print');
    });

    it('should include professional styling', () => {
      const result = formatter.format(mockReport, mockOutputConfig);
      
      expect(result).toContain('font-family:');
      expect(result).toContain('box-shadow:');
      expect(result).toContain('border-radius:');
      expect(result).toContain('.report-container');
      expect(result).toContain('.report-title');
      expect(result).toContain('.code-block');
      expect(result).toContain('.metadata-section');
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
      
      expect(result).toContain('<h1 class="report-title">Empty Report</h1>');
      expect(result).toContain('<section class="report-summary">');
      expect(result).toContain('This report has no sections');
      expect(result).toContain('<section class="metadata-section">');
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
      
      expect(result).toContain('<h2>Empty Section</h2>');
      expect(result).toContain('<div class="section-content"></div>');
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
      
      expect(result).toContain('<h2>Long Section</h2>');
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
      
      expect(result).toContain('<h1 class="report-title">Report with émojis 🚀 and ünïcödé</h1>');
      expect(result).toContain('<h2>Unicode Section 📊</h2>');
      expect(result).toContain('Content with various characters: αβγ, 中文, العربية');
    });

    it('should handle code blocks without language specification', () => {
      const reportWithCodeBlock: ProcessedReport = {
        ...mockReport,
        sections: [{
          title: 'Code Without Language',
          content: 'Here is code:\n\n```\nfunction test() {\n  return true;\n}\n```',
          priority: 1
        }]
      };

      const result = formatter.format(reportWithCodeBlock, mockOutputConfig);
      
      expect(result).toContain('<pre class="code-block">');
      expect(result).toContain('<code>function test() {\n  return true;\n}</code>');
    });
  });
});