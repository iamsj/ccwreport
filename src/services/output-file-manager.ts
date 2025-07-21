// Output file management with error handling, custom paths, and backup options

import * as fs from 'fs/promises';
import * as path from 'path';
import { ProcessedReport } from '../models/ai';
import { OutputConfiguration, OutputFormat } from '../models/config';
import { MarkdownFormatter } from './formatters/markdown-formatter';
import { HTMLFormatter } from './formatters/html-formatter';

export interface FileWriteOptions {
  overwrite?: boolean;
  createBackup?: boolean;
  ensureDirectory?: boolean;
  customFilename?: string;
}

export interface FileWriteResult {
  success: boolean;
  filePath: string;
  backupPath?: string;
  error?: string;
  bytesWritten?: number;
}

export class OutputFileManagerError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly filePath?: string,
    public readonly cause?: Error
  ) {
    super(message);
    this.name = 'OutputFileManagerError';
  }
}

/**
 * Manages output file operations with proper error handling and backup support
 */
export class OutputFileManager {
  private markdownFormatter = new MarkdownFormatter();
  private htmlFormatter = new HTMLFormatter();

  /**
   * Write a processed report to file
   * @param report The processed report to write
   * @param config Output configuration
   * @param options File write options
   * @returns File write result
   */
  async writeReport(
    report: ProcessedReport,
    config: OutputConfiguration,
    options: FileWriteOptions = {}
  ): Promise<FileWriteResult> {
    try {
      // Generate the formatted content
      const content = this.formatReport(report, config);
      
      // Generate the output file path
      const filePath = await this.generateFilePath(report, config, options);
      
      // Write the file with all safety checks
      return await this.writeFile(filePath, content, options);
    } catch (error) {
      if (error instanceof OutputFileManagerError) {
        throw error;
      }
      
      throw new OutputFileManagerError(
        `Failed to write report: ${error instanceof Error ? error.message : String(error)}`,
        'WRITE_REPORT_ERROR',
        undefined,
        error instanceof Error ? error : undefined
      );
    }
  }

  /**
   * Write content to a file with safety checks and backup options
   * @param filePath Target file path
   * @param content Content to write
   * @param options Write options
   * @returns File write result
   */
  async writeFile(
    filePath: string,
    content: string,
    options: FileWriteOptions = {}
  ): Promise<FileWriteResult> {
    const {
      overwrite = false,
      createBackup = true,
      ensureDirectory = true
    } = options;

    try {
      // Validate file path
      this.validateFilePath(filePath);

      // Ensure directory exists if requested
      if (ensureDirectory) {
        await this.ensureDirectoryExists(path.dirname(filePath));
      }

      // Check if file exists and handle accordingly
      const fileExists = await this.fileExists(filePath);
      let backupPath: string | undefined;

      if (fileExists) {
        if (!overwrite) {
          throw new OutputFileManagerError(
            `File already exists and overwrite is disabled: ${filePath}`,
            'FILE_EXISTS_ERROR',
            filePath
          );
        }

        // Create backup if requested
        if (createBackup) {
          backupPath = await this.createBackup(filePath);
        }
      }

      // Write the file
      const buffer = Buffer.from(content, 'utf8');
      await fs.writeFile(filePath, buffer);

      // Verify the write was successful
      const stats = await fs.stat(filePath);
      
      return {
        success: true,
        filePath,
        backupPath,
        bytesWritten: stats.size
      };

    } catch (error) {
      if (error instanceof OutputFileManagerError) {
        throw error;
      }

      const errorMessage = error instanceof Error ? error.message : String(error);
      const errorCode = this.getErrorCode(error);
      
      throw new OutputFileManagerError(
        `Failed to write file ${filePath}: ${errorMessage}`,
        errorCode,
        filePath,
        error instanceof Error ? error : undefined
      );
    }
  }

  /**
   * Generate output file path based on report and configuration
   * @param report The processed report
   * @param config Output configuration
   * @param options File write options
   * @returns Generated file path
   */
  async generateFilePath(
    report: ProcessedReport,
    config: OutputConfiguration,
    options: FileWriteOptions = {}
  ): Promise<string> {
    try {
      // Use custom filename if provided
      if (options.customFilename) {
        return path.resolve(config.outputPath, options.customFilename);
      }

      // Use configured filename if provided
      if (config.filename) {
        return path.resolve(config.outputPath, config.filename);
      }

      // Generate filename based on report metadata
      const timestamp = report.metadata.generatedAt.toISOString().split('T')[0];
      const reportType = report.metadata.reportType;
      const extension = config.format === 'html' ? 'html' : 'md';
      
      const filename = `${reportType}-report-${timestamp}.${extension}`;
      return path.resolve(config.outputPath, filename);

    } catch (error) {
      throw new OutputFileManagerError(
        `Failed to generate file path: ${error instanceof Error ? error.message : String(error)}`,
        'PATH_GENERATION_ERROR',
        undefined,
        error instanceof Error ? error : undefined
      );
    }
  }

  /**
   * Create a backup of an existing file
   * @param filePath Path to the file to backup
   * @returns Path to the backup file
   */
  async createBackup(filePath: string): Promise<string> {
    try {
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const ext = path.extname(filePath);
      const base = path.basename(filePath, ext);
      const dir = path.dirname(filePath);
      
      const backupPath = path.join(dir, `${base}.backup-${timestamp}${ext}`);
      
      await fs.copyFile(filePath, backupPath);
      return backupPath;

    } catch (error) {
      throw new OutputFileManagerError(
        `Failed to create backup of ${filePath}: ${error instanceof Error ? error.message : String(error)}`,
        'BACKUP_ERROR',
        filePath,
        error instanceof Error ? error : undefined
      );
    }
  }

  /**
   * Ensure directory exists, creating it if necessary
   * @param dirPath Directory path to ensure
   */
  async ensureDirectoryExists(dirPath: string): Promise<void> {
    try {
      await fs.access(dirPath);
    } catch (error) {
      // Directory doesn't exist, create it
      try {
        await fs.mkdir(dirPath, { recursive: true });
      } catch (mkdirError) {
        throw new OutputFileManagerError(
          `Failed to create directory ${dirPath}: ${mkdirError instanceof Error ? mkdirError.message : String(mkdirError)}`,
          'DIRECTORY_CREATION_ERROR',
          dirPath,
          mkdirError instanceof Error ? mkdirError : undefined
        );
      }
    }
  }

  /**
   * Check if a file exists
   * @param filePath File path to check
   * @returns True if file exists
   */
  async fileExists(filePath: string): Promise<boolean> {
    try {
      await fs.access(filePath);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Format report using appropriate formatter
   * @param report The processed report
   * @param config Output configuration
   * @returns Formatted content
   */
  private formatReport(report: ProcessedReport, config: OutputConfiguration): string {
    switch (config.format) {
      case 'html':
        return this.htmlFormatter.format(report, config);
      case 'markdown':
      default:
        return this.markdownFormatter.format(report, config);
    }
  }

  /**
   * Validate file path for security and correctness
   * @param filePath File path to validate
   */
  private validateFilePath(filePath: string): void {
    if (!filePath || filePath.trim() === '') {
      throw new OutputFileManagerError(
        'File path cannot be empty',
        'INVALID_PATH_ERROR',
        filePath
      );
    }

    // Check for path traversal attempts
    const normalizedPath = path.normalize(filePath);
    if (normalizedPath.includes('..')) {
      throw new OutputFileManagerError(
        'Path traversal detected in file path',
        'SECURITY_ERROR',
        filePath
      );
    }

    // Check for invalid characters (Windows and Unix)
    const invalidChars = /[<>:"|?*\x00-\x1f]/;
    if (invalidChars.test(path.basename(filePath))) {
      throw new OutputFileManagerError(
        'File path contains invalid characters',
        'INVALID_PATH_ERROR',
        filePath
      );
    }

    // Check path length (reasonable limit)
    if (filePath.length > 260) {
      throw new OutputFileManagerError(
        'File path is too long',
        'INVALID_PATH_ERROR',
        filePath
      );
    }
  }

  /**
   * Get error code from system error
   * @param error System error
   * @returns Error code string
   */
  private getErrorCode(error: unknown): string {
    if (error && typeof error === 'object' && 'code' in error) {
      const code = (error as { code: string }).code;
      switch (code) {
        case 'ENOENT':
          return 'FILE_NOT_FOUND_ERROR';
        case 'EACCES':
        case 'EPERM':
          return 'PERMISSION_ERROR';
        case 'ENOSPC':
          return 'DISK_FULL_ERROR';
        case 'EMFILE':
        case 'ENFILE':
          return 'TOO_MANY_FILES_ERROR';
        case 'EEXIST':
          return 'FILE_EXISTS_ERROR';
        default:
          return 'FILE_SYSTEM_ERROR';
      }
    }
    return 'UNKNOWN_ERROR';
  }

  /**
   * Get available disk space for a path
   * @param dirPath Directory path to check
   * @returns Available space in bytes, or null if cannot determine
   */
  async getAvailableSpace(dirPath: string): Promise<number | null> {
    try {
      const stats = await fs.statfs(dirPath);
      return stats.bavail * stats.bsize;
    } catch {
      // statfs not available on all platforms
      return null;
    }
  }

  /**
   * Clean up old backup files
   * @param dirPath Directory to clean
   * @param maxAge Maximum age in milliseconds
   * @param pattern Pattern to match backup files
   */
  async cleanupBackups(
    dirPath: string,
    maxAge: number = 7 * 24 * 60 * 60 * 1000, // 7 days
    pattern: RegExp = /\.backup-\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}-\d{3}Z\./
  ): Promise<string[]> {
    const cleanedFiles: string[] = [];
    
    try {
      const files = await fs.readdir(dirPath);
      const now = Date.now();
      
      for (const file of files) {
        if (pattern.test(file)) {
          const filePath = path.join(dirPath, file);
          const stats = await fs.stat(filePath);
          
          if (now - stats.mtime.getTime() > maxAge) {
            await fs.unlink(filePath);
            cleanedFiles.push(filePath);
          }
        }
      }
    } catch (error) {
      // Log error but don't throw - cleanup is not critical
      console.warn(`Failed to cleanup backups in ${dirPath}:`, error);
    }
    
    return cleanedFiles;
  }
}