// HTML formatter for converting ProcessedReport to HTML format

import { ProcessedReport, ReportSection } from '../../models/ai';
import { OutputConfiguration } from '../../models/config';

/**
 * Formatter for converting ProcessedReport to HTML format
 */
export class HTMLFormatter {
  /**
   * Convert a ProcessedReport to HTML format
   * @param report The processed report to format
   * @param config Output configuration options
   * @returns Formatted HTML string
   */
  format(report: ProcessedReport, config: OutputConfiguration): string {
    const htmlParts: string[] = [];

    // Add HTML document structure
    htmlParts.push(this.generateDocumentStart(report.title, config));
    
    // Add main content container
    htmlParts.push('<div class="report-container">');
    
    // Add title
    htmlParts.push(`<h1 class="report-title">${this.escapeHtml(report.title)}</h1>`);

    // Add summary if present
    if (report.summary && report.summary.trim()) {
      htmlParts.push('<section class="report-summary">');
      htmlParts.push('<h2>Summary</h2>');
      htmlParts.push(`<div class="summary-content">${this.formatContent(report.summary)}</div>`);
      htmlParts.push('</section>');
    }

    // Sort sections by priority (lower number = higher priority)
    const sortedSections = [...report.sections].sort((a, b) => a.priority - b.priority);

    // Add report sections
    for (const section of sortedSections) {
      htmlParts.push(this.formatSection(section));
    }

    // Add metadata if enabled
    if (config.includeMetadata) {
      htmlParts.push(this.formatMetadata(report));
    }

    // Close main container and document
    htmlParts.push('</div>');
    htmlParts.push(this.generateDocumentEnd());

    return htmlParts.join('\n');
  }

  /**
   * Generate the HTML document start with CSS styling
   * @param title Document title
   * @param config Output configuration
   * @returns HTML document start
   */
  private generateDocumentStart(title: string, config: OutputConfiguration): string {
    const escapedTitle = this.escapeHtml(title);
    const css = this.generateCSS(config);
    
    return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${escapedTitle}</title>
    <style>
${css}
    </style>
</head>
<body>`;
  }

  /**
   * Generate the HTML document end
   * @returns HTML document end
   */
  private generateDocumentEnd(): string {
    return '</body>\n</html>';
  }

  /**
   * Generate CSS styling for the HTML report
   * @param config Output configuration
   * @returns CSS string
   */
  private generateCSS(config: OutputConfiguration): string {
    const baseCSS = `        body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Roboto', 'Oxygen', 'Ubuntu', 'Cantarell', sans-serif;
            line-height: 1.6;
            color: #333;
            max-width: 1200px;
            margin: 0 auto;
            padding: 20px;
            background-color: #f8f9fa;
        }

        .report-container {
            background: white;
            border-radius: 8px;
            box-shadow: 0 2px 10px rgba(0, 0, 0, 0.1);
            padding: 40px;
            margin: 20px 0;
        }

        .report-title {
            color: #2c3e50;
            border-bottom: 3px solid #3498db;
            padding-bottom: 15px;
            margin-bottom: 30px;
            font-size: 2.5em;
            font-weight: 300;
        }

        .report-summary {
            background: #ecf0f1;
            border-left: 4px solid #3498db;
            padding: 20px;
            margin: 30px 0;
            border-radius: 0 4px 4px 0;
        }

        .report-summary h2 {
            margin-top: 0;
            color: #2c3e50;
            font-size: 1.4em;
        }

        .summary-content {
            font-size: 1.1em;
            color: #555;
        }

        .report-section {
            margin: 40px 0;
            padding: 20px 0;
            border-bottom: 1px solid #eee;
        }

        .report-section:last-of-type {
            border-bottom: none;
        }

        .report-section h2 {
            color: #2c3e50;
            font-size: 1.8em;
            margin-bottom: 20px;
            padding-bottom: 10px;
            border-bottom: 2px solid #ecf0f1;
        }

        .section-content {
            font-size: 1em;
            line-height: 1.7;
        }

        .section-content p {
            margin: 15px 0;
        }

        .section-content ul, .section-content ol {
            margin: 15px 0;
            padding-left: 30px;
        }

        .section-content li {
            margin: 8px 0;
        }

        .code-inline {
            background: #f1f2f6;
            color: #e74c3c;
            padding: 2px 6px;
            border-radius: 3px;
            font-family: 'Monaco', 'Menlo', 'Ubuntu Mono', monospace;
            font-size: 0.9em;
        }

        .code-block {
            background: #2c3e50;
            color: #ecf0f1;
            padding: 20px;
            border-radius: 6px;
            overflow-x: auto;
            margin: 20px 0;
            font-family: 'Monaco', 'Menlo', 'Ubuntu Mono', monospace;
            font-size: 0.9em;
            line-height: 1.4;
        }

        .metadata-section {
            background: #f8f9fa;
            border: 1px solid #dee2e6;
            border-radius: 6px;
            padding: 25px;
            margin-top: 40px;
        }

        .metadata-section h2 {
            color: #495057;
            font-size: 1.4em;
            margin-bottom: 20px;
            border-bottom: 2px solid #dee2e6;
            padding-bottom: 10px;
        }

        .metadata-grid {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
            gap: 15px;
        }

        .metadata-item {
            display: flex;
            align-items: center;
        }

        .metadata-label {
            font-weight: 600;
            color: #495057;
            min-width: 140px;
            margin-right: 10px;
        }

        .metadata-value {
            color: #6c757d;
            font-family: 'Monaco', 'Menlo', 'Ubuntu Mono', monospace;
            font-size: 0.9em;
        }

        .commit-hash {
            background: #f1f2f6;
            color: #e74c3c;
            padding: 2px 6px;
            border-radius: 3px;
            font-family: 'Monaco', 'Menlo', 'Ubuntu Mono', monospace;
            font-size: 0.85em;
        }

        .file-path {
            background: #f1f2f6;
            color: #8e44ad;
            padding: 2px 6px;
            border-radius: 3px;
            font-family: 'Monaco', 'Menlo', 'Ubuntu Mono', monospace;
            font-size: 0.85em;
        }

        @media (max-width: 768px) {
            body {
                padding: 10px;
            }
            
            .report-container {
                padding: 20px;
            }
            
            .report-title {
                font-size: 2em;
            }
            
            .metadata-grid {
                grid-template-columns: 1fr;
            }
        }

        @media print {
            body {
                background-color: white;
                padding: 0;
            }
            
            .report-container {
                box-shadow: none;
                border-radius: 0;
            }
        }`;

    // Add custom CSS if provided
    if (config.styling?.customCss) {
      return baseCSS + '\n\n        /* Custom CSS */\n' + config.styling.customCss;
    }

    return baseCSS;
  }

  /**
   * Format a report section as HTML
   * @param section The section to format
   * @returns Formatted section HTML
   */
  private formatSection(section: ReportSection): string {
    const title = this.escapeHtml(section.title);
    const content = this.formatContent(section.content);
    
    return `<section class="report-section">
    <h2>${title}</h2>
    <div class="section-content">${content}</div>
</section>`;
  }

  /**
   * Format content with proper HTML handling
   * @param content Raw content to format
   * @returns Formatted content with proper HTML
   */
  private formatContent(content: string): string {
    if (!content || !content.trim()) {
      return '';
    }

    // Handle code blocks first - preserve existing code blocks
    const codeBlockRegex = /```(\w+)?\n?([\s\S]*?)```/g;
    const codeBlocks: string[] = [];
    let processedContent = content.replace(codeBlockRegex, (match, language, code) => {
      const placeholder = `__CODE_BLOCK_${codeBlocks.length}__`;
      const escapedCode = this.escapeHtml(code.trim());
      const languageClass = language ? ` language-${language}` : '';
      codeBlocks.push(`<pre class="code-block${languageClass}"><code>${escapedCode}</code></pre>`);
      return placeholder;
    });

    // Handle inline code - preserve existing inline code
    const inlineCodeRegex = /`([^`]+)`/g;
    const inlineCodes: string[] = [];
    processedContent = processedContent.replace(inlineCodeRegex, (match, code) => {
      const placeholder = `__INLINE_CODE_${inlineCodes.length}__`;
      inlineCodes.push(`<code class="code-inline">${this.escapeHtml(code)}</code>`);
      return placeholder;
    });

    // Format commit hashes and file paths BEFORE HTML escaping
    // Format commit hashes as spans if they look like git hashes
    processedContent = processedContent.replace(/\b([a-f0-9]{7,40})\b/g, '<span class="commit-hash">$1</span>');

    // Format file paths as spans (more specific pattern)
    processedContent = processedContent.replace(/\b([\w\-\.\/\\]+\.(js|ts|tsx|jsx|py|java|cpp|c|h|css|html|md|json|xml|yml|yaml))\b/g, '<span class="file-path">$1</span>');

    // Escape HTML in the remaining content (but preserve our spans)
    const spanRegex = /<span class="(commit-hash|file-path)">([^<]+)<\/span>/g;
    const spans: string[] = [];
    processedContent = processedContent.replace(spanRegex, (match) => {
      const placeholder = `__SPAN_${spans.length}__`;
      spans.push(match);
      return placeholder;
    });

    // Now escape HTML
    processedContent = this.escapeHtml(processedContent);

    // Restore spans
    spans.forEach((span, index) => {
      processedContent = processedContent.replace(`__SPAN_${index}__`, span);
    });

    // Convert line breaks to paragraphs
    const paragraphs = processedContent.split(/\n\s*\n/).filter(p => p.trim());
    processedContent = paragraphs.map(p => {
      const trimmed = p.trim();
      if (trimmed.startsWith('__CODE_BLOCK_') || trimmed.startsWith('<pre')) {
        return trimmed; // Don't wrap code blocks in paragraphs
      }
      return `<p>${trimmed.replace(/\n/g, '<br>')}</p>`;
    }).join('\n');

    // Restore inline codes
    inlineCodes.forEach((code, index) => {
      processedContent = processedContent.replace(`__INLINE_CODE_${index}__`, code);
    });

    // Restore code blocks
    codeBlocks.forEach((block, index) => {
      processedContent = processedContent.replace(`__CODE_BLOCK_${index}__`, block);
    });

    return processedContent;
  }

  /**
   * Format metadata section
   * @param report The report containing metadata
   * @returns Formatted metadata section HTML
   */
  private formatMetadata(report: ProcessedReport): string {
    const metadata = report.metadata;
    
    const metadataItems = [
      { label: 'Generated At', value: metadata.generatedAt.toISOString() },
      { label: 'Report Type', value: metadata.reportType },
      { label: 'Time Range', value: `${metadata.timeRange.start.toISOString()} to ${metadata.timeRange.end.toISOString()}` },
      { label: 'Data Sources', value: metadata.dataSourcesUsed.join(', ') },
      { label: 'AI Provider', value: metadata.aiProvider },
      { label: 'Model', value: metadata.model },
      { label: 'Processing Time', value: `${metadata.processingTime}ms` }
    ];

    const metadataItemsHtml = metadataItems.map(item => `
        <div class="metadata-item">
            <span class="metadata-label">${item.label}:</span>
            <span class="metadata-value">${this.escapeHtml(item.value)}</span>
        </div>`).join('');

    return `<section class="metadata-section">
    <h2>Report Metadata</h2>
    <div class="metadata-grid">${metadataItemsHtml}
    </div>
</section>`;
  }

  /**
   * Escape HTML special characters
   * @param text Text to escape
   * @returns Escaped HTML text
   */
  private escapeHtml(text: string): string {
    if (!text) return '';
    
    const htmlEscapes: Record<string, string> = {
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#x27;',
      '/': '&#x2F;'
    };
    
    return text.replace(/[&<>"'/]/g, (match) => htmlEscapes[match]);
  }

  /**
   * Validate that the generated HTML is well-formed
   * @param html The HTML content to validate
   * @returns Validation result
   */
  validateHtml(html: string): { isValid: boolean; errors: string[] } {
    const errors: string[] = [];

    // Check for basic HTML structure
    if (!html.includes('<!DOCTYPE html>')) {
      errors.push('Missing DOCTYPE declaration');
    }

    if (!html.includes('<html') || !html.includes('</html>')) {
      errors.push('Missing html tags');
    }

    if (!html.includes('<head>') || !html.includes('</head>')) {
      errors.push('Missing head section');
    }

    if (!html.includes('<body>') || !html.includes('</body>')) {
      errors.push('Missing body section');
    }

    // Check for unmatched tags (basic validation)
    const tagRegex = /<\/?([a-zA-Z][a-zA-Z0-9]*)\b[^>]*>/g;
    const tagStack: string[] = [];
    const selfClosingTags = new Set(['br', 'hr', 'img', 'input', 'meta', 'link']);
    
    let match;
    while ((match = tagRegex.exec(html)) !== null) {
      const fullTag = match[0];
      const tagName = match[1].toLowerCase();
      
      if (selfClosingTags.has(tagName) || fullTag.endsWith('/>')) {
        continue; // Self-closing tag
      }
      
      if (fullTag.startsWith('</')) {
        // Closing tag
        if (tagStack.length === 0 || tagStack[tagStack.length - 1] !== tagName) {
          errors.push(`Unmatched closing tag: ${fullTag}`);
        } else {
          tagStack.pop();
        }
      } else {
        // Opening tag
        tagStack.push(tagName);
      }
    }

    if (tagStack.length > 0) {
      errors.push(`Unclosed tags: ${tagStack.join(', ')}`);
    }

    // Check for proper HTML escaping in content (should not have unescaped < > & outside of tags)
    const contentRegex = />([^<]*)</g;
    let contentMatch;
    while ((contentMatch = contentRegex.exec(html)) !== null) {
      const content = contentMatch[1];
      if (content.includes('<') || content.includes('>')) {
        // Allow some exceptions for properly formatted content
        if (!content.includes('&lt;') && !content.includes('&gt;')) {
          errors.push('Unescaped HTML characters in content');
          break;
        }
      }
    }

    return {
      isValid: errors.length === 0,
      errors
    };
  }
}