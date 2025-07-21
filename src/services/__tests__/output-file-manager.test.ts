// Tests for OutputFileManager

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as fs from 'fs/promises';
import * as path from 'path';
import { OutputFileManager, OutputFileManagerError } from '../output-file-manager';
import { ProcessedReport } from '../../models/ai';
import { OutputConfiguration } from '../../models/config';

// Mock fs module
vi.mock('fs/promises');

const mockFs = vi.mocked(fs);

describe('OutputFileManager', () => {
  let outputManager: OutputFileManager;
  let mockReport: ProcessedReport;
  let mockConfig: OutputConfiguration;
  let tempDir: string;

  beforeEach(() => {
    outputManager = new OutputFileManager();
    tempDir = '/tmp/test-reports';
    
    mockReport = {
      title: 'Test Report',
      summary: 'This is a test report summary',
      sections: [
        {
          title: 'Section 1',
          content: 'Content for section 1',
          priority: 1
        },
        {
          title: 'Section 2', 
          content: 'Content for section 2',
          priority: 2
        }
      ],
      metadata: {
        generatedAt: new Date('2024-01-15T10:00:00Z'),
        reportType: 'daily',
        timeRange: {
          start: new Date('2024-01-14T00:00:00Z'),
          end: new Date('2024-01-15T00:00:00Z'),
          type: 'daily'
        },
        dataSourcesUsed: ['git'],
        aiProvider: 'openai',
        model: 'gpt-4',
        processingTime: 1500
      }
    };

    mockConfig = {
      format: 'markdown',
      outputPath: tempDir,
      includeMetadata: true
    };

    // Reset all mocks
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('writeReport', () => {
    it('should write markdown report successfully', async () => {
      const expectedPath = path.resolve(tempDir, 'daily-report-2024-01-15.md');
      
      mockFs.access.mockRejectedValueOnce(new Error('Directory not found'));
      mockFs.mkdir.mockResolvedValueOnce(undefined);
      mockFs.access.mockRejectedValueOnce(new Error('File not found')); // File doesn't exist
      mockFs.writeFile.mockResolvedValueOnce(undefined);
      mockFs.stat.mockResolvedValueOnce({ size: 1024 } as any);

      const result = await outputManager.writeReport(mockReport, mockConfig, { overwrite: true });

      expect(result.success).toBe(true);
      expect(result.filePath).toBe(expectedPath);
      expect(result.bytesWritten).toBe(1024);
      expect(mockFs.writeFile).toHaveBeenCalledWith(expectedPath, expect.any(Buffer));
    });

    it('should write HTML report successfully', async () => {
      mockConfig.format = 'html';
      const expectedPath = path.resolve(tempDir, 'daily-report-2024-01-15.html');
      
      mockFs.access.mockRejectedValueOnce(new Error('Directory not found'));
      mockFs.mkdir.mockResolvedValueOnce(undefined);
      mockFs.access.mockRejectedValueOnce(new Error('File not found')); // File doesn't exist
      mockFs.writeFile.mockResolvedValueOnce(undefined);
      mockFs.stat.mockResolvedValueOnce({ size: 2048 } as any);

      const result = await outputManager.writeReport(mockReport, mockConfig, { overwrite: true });

      expect(result.success).toBe(true);
      expect(result.filePath).toBe(expectedPath);
      expect(result.bytesWritten).toBe(2048);
    });

    it('should use custom filename when provided', async () => {
      const customFilename = 'custom-report.md';
      const expectedPath = path.resolve(tempDir, customFilename);
      
      mockFs.access.mockRejectedValueOnce(new Error('Directory not found'));
      mockFs.mkdir.mockResolvedValueOnce(undefined);
      mockFs.access.mockRejectedValueOnce(new Error('File not found')); // File doesn't exist
      mockFs.writeFile.mockResolvedValueOnce(undefined);
      mockFs.stat.mockResolvedValueOnce({ size: 1024 } as any);

      const result = await outputManager.writeReport(mockReport, mockConfig, {
        customFilename,
        overwrite: true
      });

      expect(result.filePath).toBe(expectedPath);
    });

    it('should use configured filename when provided', async () => {
      mockConfig.filename = 'configured-report.md';
      const expectedPath = path.resolve(tempDir, 'configured-report.md');
      
      mockFs.access.mockRejectedValueOnce(new Error('Directory not found'));
      mockFs.mkdir.mockResolvedValueOnce(undefined);
      mockFs.access.mockRejectedValueOnce(new Error('File not found')); // File doesn't exist
      mockFs.writeFile.mockResolvedValueOnce(undefined);
      mockFs.stat.mockResolvedValueOnce({ size: 1024 } as any);

      const result = await outputManager.writeReport(mockReport, mockConfig, { overwrite: true });

      expect(result.filePath).toBe(expectedPath);
    });
  });

  describe('writeFile', () => {
    const testContent = 'Test file content';
    let testPath: string;

    beforeEach(() => {
      testPath = path.join(tempDir, 'test.txt');
    });

    it('should write file when it does not exist', async () => {
      mockFs.access.mockRejectedValueOnce(new Error('Directory not found'));
      mockFs.mkdir.mockResolvedValueOnce(undefined);
      mockFs.access.mockRejectedValueOnce(new Error('File not found')); // File doesn't exist
      mockFs.writeFile.mockResolvedValueOnce(undefined);
      mockFs.stat.mockResolvedValueOnce({ size: testContent.length } as any);

      const result = await outputManager.writeFile(testPath, testContent);

      expect(result.success).toBe(true);
      expect(result.filePath).toBe(testPath);
      expect(result.bytesWritten).toBe(testContent.length);
    });

    it('should create backup when overwriting existing file', async () => {
      const backupPath = path.join(tempDir, 'test.backup-2024-01-15T10-00-00-000Z.txt');
      
      mockFs.access.mockResolvedValueOnce(undefined); // Directory exists
      mockFs.access.mockResolvedValueOnce(undefined); // File exists
      mockFs.copyFile.mockResolvedValueOnce(undefined);
      mockFs.writeFile.mockResolvedValueOnce(undefined);
      mockFs.stat.mockResolvedValueOnce({ size: testContent.length } as any);

      // Mock Date to get predictable backup filename
      const mockDate = new Date('2024-01-15T10:00:00.000Z');
      vi.spyOn(global, 'Date').mockImplementation(() => mockDate as any);

      const result = await outputManager.writeFile(testPath, testContent, {
        overwrite: true,
        createBackup: true
      });

      expect(result.success).toBe(true);
      expect(result.backupPath).toBe(backupPath);
      expect(mockFs.copyFile).toHaveBeenCalledWith(testPath, backupPath);
    });

    it('should throw error when file exists and overwrite is disabled', async () => {
      mockFs.access.mockResolvedValueOnce(undefined); // Directory exists
      mockFs.access.mockResolvedValueOnce(undefined); // File exists

      await expect(
        outputManager.writeFile(testPath, testContent, { overwrite: false })
      ).rejects.toThrow(OutputFileManagerError);
    });

    it('should handle permission errors', async () => {
      mockFs.access.mockResolvedValueOnce(undefined); // Directory exists
      mockFs.access.mockRejectedValueOnce(new Error('File not found')); // File doesn't exist
      
      const permissionError = new Error('Permission denied') as any;
      permissionError.code = 'EACCES';
      mockFs.writeFile.mockRejectedValueOnce(permissionError);

      await expect(
        outputManager.writeFile(testPath, testContent)
      ).rejects.toThrow(OutputFileManagerError);
    });

    it('should handle disk full errors', async () => {
      mockFs.access.mockResolvedValueOnce(undefined); // Directory exists
      mockFs.access.mockRejectedValueOnce(new Error('File not found')); // File doesn't exist
      
      const diskFullError = new Error('No space left on device') as any;
      diskFullError.code = 'ENOSPC';
      mockFs.writeFile.mockRejectedValueOnce(diskFullError);

      await expect(
        outputManager.writeFile(testPath, testContent)
      ).rejects.toThrow(OutputFileManagerError);
    });
  });

  describe('generateFilePath', () => {
    it('should generate path with custom filename', async () => {
      const customFilename = 'custom.md';
      const expectedPath = path.resolve(tempDir, customFilename);

      const result = await outputManager.generateFilePath(mockReport, mockConfig, {
        customFilename
      });

      expect(result).toBe(expectedPath);
    });

    it('should generate path with configured filename', async () => {
      mockConfig.filename = 'configured.md';
      const expectedPath = path.resolve(tempDir, 'configured.md');

      const result = await outputManager.generateFilePath(mockReport, mockConfig);

      expect(result).toBe(expectedPath);
    });

    it('should generate default filename for markdown', async () => {
      const expectedPath = path.resolve(tempDir, 'daily-report-2024-01-15.md');

      const result = await outputManager.generateFilePath(mockReport, mockConfig);

      expect(result).toBe(expectedPath);
    });

    it('should generate default filename for HTML', async () => {
      mockConfig.format = 'html';
      const expectedPath = path.resolve(tempDir, 'daily-report-2024-01-15.html');

      const result = await outputManager.generateFilePath(mockReport, mockConfig);

      expect(result).toBe(expectedPath);
    });

    it('should handle different report types', async () => {
      mockReport.metadata.reportType = 'weekly';
      const expectedPath = path.resolve(tempDir, 'weekly-report-2024-01-15.md');

      const result = await outputManager.generateFilePath(mockReport, mockConfig);

      expect(result).toBe(expectedPath);
    });
  });

  describe('createBackup', () => {
    it('should create backup with timestamp', async () => {
      const originalPath = path.join(tempDir, 'original.txt');
      const expectedBackupPath = path.join(tempDir, 'original.backup-2024-01-15T10-00-00-000Z.txt');
      
      // Mock Date to get predictable backup filename
      const mockDate = new Date('2024-01-15T10:00:00.000Z');
      vi.spyOn(global, 'Date').mockImplementation(() => mockDate as any);
      
      mockFs.copyFile.mockResolvedValueOnce(undefined);

      const result = await outputManager.createBackup(originalPath);

      expect(result).toBe(expectedBackupPath);
      expect(mockFs.copyFile).toHaveBeenCalledWith(originalPath, expectedBackupPath);
    });

    it('should handle backup creation errors', async () => {
      const originalPath = path.join(tempDir, 'original.txt');
      
      mockFs.copyFile.mockRejectedValueOnce(new Error('Copy failed'));

      await expect(
        outputManager.createBackup(originalPath)
      ).rejects.toThrow(OutputFileManagerError);
    });
  });

  describe('ensureDirectoryExists', () => {
    it('should not create directory if it exists', async () => {
      mockFs.access.mockResolvedValueOnce(undefined);

      await outputManager.ensureDirectoryExists(tempDir);

      expect(mockFs.mkdir).not.toHaveBeenCalled();
    });

    it('should create directory if it does not exist', async () => {
      mockFs.access.mockRejectedValueOnce(new Error('Directory not found'));
      mockFs.mkdir.mockResolvedValueOnce(undefined);

      await outputManager.ensureDirectoryExists(tempDir);

      expect(mockFs.mkdir).toHaveBeenCalledWith(tempDir, { recursive: true });
    });

    it('should handle directory creation errors', async () => {
      mockFs.access.mockRejectedValueOnce(new Error('Directory not found'));
      mockFs.mkdir.mockRejectedValueOnce(new Error('Permission denied'));

      await expect(
        outputManager.ensureDirectoryExists(tempDir)
      ).rejects.toThrow(OutputFileManagerError);
    });
  });

  describe('fileExists', () => {
    it('should return true if file exists', async () => {
      const testPath = path.join(tempDir, 'test.txt');
      mockFs.access.mockResolvedValueOnce(undefined);

      const result = await outputManager.fileExists(testPath);

      expect(result).toBe(true);
    });

    it('should return false if file does not exist', async () => {
      const testPath = path.join(tempDir, 'test.txt');
      mockFs.access.mockRejectedValueOnce(new Error('File not found'));

      const result = await outputManager.fileExists(testPath);

      expect(result).toBe(false);
    });
  });

  describe('path validation', () => {
    it('should reject empty paths', async () => {
      await expect(
        outputManager.writeFile('', 'content')
      ).rejects.toThrow(OutputFileManagerError);
    });

    it('should reject paths with traversal attempts', async () => {
      await expect(
        outputManager.writeFile('../../../etc/passwd', 'content')
      ).rejects.toThrow(OutputFileManagerError);
    });

    it('should reject paths with invalid characters', async () => {
      await expect(
        outputManager.writeFile('/tmp/file<>:"|?*.txt', 'content')
      ).rejects.toThrow(OutputFileManagerError);
    });

    it('should reject paths that are too long', async () => {
      const longPath = '/tmp/' + 'a'.repeat(300) + '.txt';
      
      await expect(
        outputManager.writeFile(longPath, 'content')
      ).rejects.toThrow(OutputFileManagerError);
    });
  });

  describe('cleanupBackups', () => {
    it('should clean up old backup files', async () => {
      const oldBackupFile = 'test.backup-2024-01-01T10-00-00-000Z.txt';
      const recentBackupFile = 'test.backup-2024-01-14T10-00-00-000Z.txt';
      const regularFile = 'test.txt';
      
      mockFs.readdir.mockResolvedValueOnce([oldBackupFile, recentBackupFile, regularFile]);
      
      // Mock file stats - old file is older than maxAge, recent file is not
      const oldDate = new Date('2024-01-01T10:00:00Z');
      const recentDate = new Date('2024-01-14T10:00:00Z');
      
      mockFs.stat
        .mockResolvedValueOnce({ mtime: oldDate } as any) // old backup
        .mockResolvedValueOnce({ mtime: recentDate } as any); // recent backup
      
      mockFs.unlink.mockResolvedValueOnce(undefined);

      // Set current time to make old backup exceed maxAge
      vi.spyOn(Date, 'now').mockReturnValue(new Date('2024-01-15T10:00:00Z').getTime());

      const result = await outputManager.cleanupBackups(tempDir, 7 * 24 * 60 * 60 * 1000);

      expect(result).toHaveLength(1);
      expect(result[0]).toBe(path.join(tempDir, oldBackupFile));
      expect(mockFs.unlink).toHaveBeenCalledWith(path.join(tempDir, oldBackupFile));
    });

    it('should handle cleanup errors gracefully', async () => {
      mockFs.readdir.mockRejectedValueOnce(new Error('Permission denied'));

      // Should not throw, just log warning
      const result = await outputManager.cleanupBackups(tempDir);

      expect(result).toEqual([]);
    });
  });

  describe('error handling', () => {
    it('should create OutputFileManagerError with proper details', () => {
      const originalError = new Error('Original error');
      const error = new OutputFileManagerError(
        'Test error',
        'TEST_ERROR',
        '/test/path',
        originalError
      );

      expect(error.message).toBe('Test error');
      expect(error.code).toBe('TEST_ERROR');
      expect(error.filePath).toBe('/test/path');
      expect(error.cause).toBe(originalError);
      expect(error.name).toBe('OutputFileManagerError');
    });

    it('should map system error codes correctly', async () => {
      const testCases = [
        { code: 'ENOENT', expectedCode: 'FILE_NOT_FOUND_ERROR' },
        { code: 'EACCES', expectedCode: 'PERMISSION_ERROR' },
        { code: 'EPERM', expectedCode: 'PERMISSION_ERROR' },
        { code: 'ENOSPC', expectedCode: 'DISK_FULL_ERROR' },
        { code: 'EMFILE', expectedCode: 'TOO_MANY_FILES_ERROR' },
        { code: 'ENFILE', expectedCode: 'TOO_MANY_FILES_ERROR' },
        { code: 'EEXIST', expectedCode: 'FILE_EXISTS_ERROR' }
      ];

      for (const testCase of testCases) {
        mockFs.access.mockResolvedValueOnce(undefined); // Directory exists
        mockFs.access.mockRejectedValueOnce(new Error('File not found')); // File doesn't exist
        
        const systemError = new Error('System error') as any;
        systemError.code = testCase.code;
        mockFs.writeFile.mockRejectedValueOnce(systemError);

        await expect(
          outputManager.writeFile('/test/path', 'content')
        ).rejects.toThrow(expect.objectContaining({
          code: testCase.expectedCode
        }));

        vi.clearAllMocks();
      }
    });
  });
});