// Markdown formatter for converting ProcessedReport to markdown format

import { ProcessedReport, ReportSection } from '../../models/ai';
import { OutputConfiguration } from '../../models/config';

/**
 * Formatter for converting ProcessedReport to markdown format
 */
export class MarkdownFormatter {
  /**
   * Convert a ProcessedReport to markdown format
   * @param report The processed report to format
   * @param config Output configuration options
   * @returns Formatted markdown string
   */
  format(report: ProcessedReport, config: OutputConfiguration): string {
    const sections: string[] = [];

    // Add title
    sections.push(`# ${this.escapeMarkdown(report.title)}\n`);

    // Add summary if present
    if (report.summary && report.summary.trim()) {
      sections.push(`## Summary\n\n${this.formatContent(report.summary)}\n`);
    }

    // Sort sections by priority (lower number = higher priority)
    const sortedSections = [...report.sections].sort((a, b) => a.priority - b.priority);

    // Add report sections
    for (const section of sortedSections) {
      sections.push(this.formatSection(section));
    }

    // Add metadata if enabled
    if (config.includeMetadata) {
      sections.push(this.formatMetadata(report));
    }

    return sections.join('\n');
  }

  /**
   * Format a report section as markdown
   * @param section The section to format
   * @returns Formatted section string
   */
  private formatSection(section: ReportSection): string {
    const title = this.escapeMarkdown(section.title);
    const content = this.formatContent(section.content);
    
    // Handle empty content properly - add extra newline for consistency
    if (!content) {
      return `## ${title}\n\n`;
    }
    
    return `## ${title}\n\n${content}\n`;
  }

  /**
   * Format content with proper markdown handling
   * @param content Raw content to format
   * @returns Formatted content with proper markdown
   */
  private formatContent(content: string): string {
    if (!content || !content.trim()) {
      return '';
    }

    // Handle code blocks - preserve existing code blocks
    const codeBlockRegex = /```[\s\S]*?```/g;
    const codeBlocks: string[] = [];
    let processedContent = content.replace(codeBlockRegex, (match) => {
      const placeholder = `__CODE_BLOCK_${codeBlocks.length}__`;
      codeBlocks.push(match);
      return placeholder;
    });

    // Handle inline code - preserve existing inline code
    const inlineCodeRegex = /`[^`]+`/g;
    const inlineCodes: string[] = [];
    processedContent = processedContent.replace(inlineCodeRegex, (match) => {
      const placeholder = `__INLINE_CODE_${inlineCodes.length}__`;
      inlineCodes.push(match);
      return placeholder;
    });

    // Format commit hashes as inline code if they look like git hashes
    processedContent = processedContent.replace(/\b([a-f0-9]{7,40})\b/g, '`$1`');

    // Format file paths as inline code (more specific pattern)
    processedContent = processedContent.replace(/\b([\w\-\.\/\\]+\.(js|ts|tsx|jsx|py|java|cpp|c|h|css|html|md|json|xml|yml|yaml))\b/g, '`$1`');

    // Restore inline codes
    inlineCodes.forEach((code, index) => {
      processedContent = processedContent.replace(`__INLINE_CODE_${index}__`, code);
    });

    // Restore code blocks
    codeBlocks.forEach((block, index) => {
      processedContent = processedContent.replace(`__CODE_BLOCK_${index}__`, block);
    });

    // Ensure proper line breaks for paragraphs
    processedContent = processedContent.replace(/\n\n+/g, '\n\n');

    return processedContent.trim();
  }

  /**
   * Format metadata section
   * @param report The report containing metadata
   * @returns Formatted metadata section
   */
  private formatMetadata(report: ProcessedReport): string {
    const metadata = report.metadata;
    const sections: string[] = [];

    sections.push('## Report Metadata\n');

    // Basic metadata
    sections.push(`- **Generated At:** ${metadata.generatedAt.toISOString()}`);
    sections.push(`- **Report Type:** ${metadata.reportType}`);
    sections.push(`- **Time Range:** ${metadata.timeRange.start.toISOString()} to ${metadata.timeRange.end.toISOString()}`);
    sections.push(`- **Data Sources:** ${metadata.dataSourcesUsed.join(', ')}`);
    sections.push(`- **AI Provider:** ${metadata.aiProvider}`);
    sections.push(`- **Model:** ${metadata.model}`);
    sections.push(`- **Processing Time:** ${metadata.processingTime}ms`);

    return sections.join('\n') + '\n';
  }

  /**
   * Escape special markdown characters
   * @param text Text to escape
   * @returns Escaped text
   */
  private escapeMarkdown(text: string): string {
    if (!text) return '';
    
    // Characters that need escaping in markdown
    const specialChars = /([\\`*_{}[\]()#+\-.!])/g;
    
    return text.replace(specialChars, '\\$1');
  }

  /**
   * Validate that the generated markdown is well-formed
   * @param markdown The markdown content to validate
   * @returns Validation result
   */
  validateMarkdown(markdown: string): { isValid: boolean; errors: string[] } {
    const errors: string[] = [];

    // Check for unmatched code blocks
    const codeBlockMatches = markdown.match(/```/g);
    if (codeBlockMatches && codeBlockMatches.length % 2 !== 0) {
      errors.push('Unmatched code block delimiters (```)');
    }

    // Check for unmatched inline code (excluding escaped backticks)
    let inlineCodeCount = 0;
    for (let i = 0; i < markdown.length; i++) {
      if (markdown[i] === '`' && (i === 0 || markdown[i - 1] !== '\\')) {
        inlineCodeCount++;
      }
    }
    if (inlineCodeCount % 2 !== 0) {
      errors.push('Unmatched inline code delimiters (`)');
    }

    // Check for proper heading structure (should start with # and have space)
    // Only check lines that start with # (actual headings, not hashtags in content)
    const lines = markdown.split('\n');
    const invalidHeadings = lines.filter(line => {
      const trimmed = line.trim();
      return trimmed.match(/^#{1,6}[^#\s]/) !== null;
    });
    
    if (invalidHeadings.length > 0) {
      errors.push('Invalid heading format - headings should have space after #');
    }

    return {
      isValid: errors.length === 0,
      errors
    };
  }
}