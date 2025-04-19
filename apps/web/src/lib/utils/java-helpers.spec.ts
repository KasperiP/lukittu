import { logger } from '@lukittu/shared';
import { Buffer } from 'buffer';
import { deflateRawSync } from 'zlib';
import { getMainClassFromJar } from './java-helpers';

jest.mock('@lukittu/shared', () => ({
  logger: {
    error: jest.fn(),
  },
}));

describe('getMainClassFromJar', () => {
  function createMockZipBuffer(
    files: { name: string; content: string; compressed?: boolean }[],
  ): Buffer {
    const fileEntries: Buffer[] = [];
    const centralDirectory: Buffer[] = [];
    let offset = 0;

    files.forEach((file) => {
      const nameBuffer = Buffer.from(file.name);
      const contentBuffer = Buffer.from(file.content);
      let compressedContent = contentBuffer;
      let compression = 0;

      if (file.compressed) {
        compressedContent = deflateRawSync(
          contentBuffer,
        ) as Buffer<ArrayBuffer>;
        compression = 8;
      }

      // Local file header
      const localHeader = Buffer.alloc(30);
      localHeader.writeUInt32LE(0x04034b50, 0); // Local file header signature
      localHeader.writeUInt16LE(compression, 8); // Compression method
      localHeader.writeUInt32LE(compressedContent.length, 18); // Compressed size
      localHeader.writeUInt32LE(contentBuffer.length, 22); // Uncompressed size
      localHeader.writeUInt16LE(nameBuffer.length, 26); // File name length

      // Central directory header
      const centralHeader = Buffer.alloc(46);
      centralHeader.writeUInt32LE(0x02014b50, 0); // Central directory signature
      centralHeader.writeUInt16LE(compression, 10); // Compression method
      centralHeader.writeUInt32LE(compressedContent.length, 20); // Compressed size
      centralHeader.writeUInt32LE(contentBuffer.length, 24); // Uncompressed size
      centralHeader.writeUInt16LE(nameBuffer.length, 28); // File name length
      centralHeader.writeUInt32LE(offset, 42); // Relative offset of local header

      fileEntries.push(localHeader, nameBuffer, compressedContent);
      centralDirectory.push(centralHeader, nameBuffer);

      offset +=
        localHeader.length + nameBuffer.length + compressedContent.length;
    });

    // End of central directory
    const endOfCentralDir = Buffer.alloc(22);
    endOfCentralDir.writeUInt32LE(0x06054b50, 0); // End of central dir signature
    endOfCentralDir.writeUInt16LE(files.length, 8); // Total number of entries
    endOfCentralDir.writeUInt32LE(offset, 16); // Offset of start of central directory

    return Buffer.concat([
      ...fileEntries,
      ...centralDirectory,
      endOfCentralDir,
    ]);
  }

  function createMockJarFile(
    files: { name: string; content: string; compressed?: boolean }[],
  ): {
    arrayBuffer: () => Promise<ArrayBuffer>;
    name: string;
    type: string;
  } {
    const zipBuffer = createMockZipBuffer(files);
    return {
      arrayBuffer: async () =>
        zipBuffer.buffer.slice(
          zipBuffer.byteOffset,
          zipBuffer.byteOffset + zipBuffer.length,
        ) as ArrayBuffer,
      name: 'test.jar',
      type: 'application/java-archive',
    };
  }

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should successfully extract main class from uncompressed plugin.yml', async () => {
    const mockFile = createMockJarFile([
      {
        name: 'plugin.yml',
        content:
          'name: TestPlugin\nmain: com.example.TestPlugin\nversion: 1.0.0',
      },
    ]);

    const result = await getMainClassFromJar(mockFile as unknown as File);
    expect(result).toBe('com.example.TestPlugin');
  });

  it('should successfully extract main class from compressed plugin.yml', async () => {
    const mockFile = createMockJarFile([
      {
        name: 'plugin.yml',
        content:
          'name: TestPlugin\nmain: com.example.TestPlugin\nversion: 1.0.0',
        compressed: true,
      },
    ]);

    const result = await getMainClassFromJar(mockFile as unknown as File);
    expect(result).toBe('com.example.TestPlugin');
  });

  it('should return null when plugin.yml is not found', async () => {
    const mockFile = createMockJarFile([
      {
        name: 'other.yml',
        content: 'some content',
      },
    ]);

    const result = await getMainClassFromJar(mockFile as unknown as File);
    expect(result).toBeNull();
    expect(logger.error).toHaveBeenCalledWith(
      'Invalid JAR file: plugin.yml not found',
    );
  });

  it('should return null when main class is not specified in plugin.yml', async () => {
    const mockFile = createMockJarFile([
      {
        name: 'plugin.yml',
        content: 'name: TestPlugin\nversion: 1.0.0',
      },
    ]);

    const result = await getMainClassFromJar(mockFile as unknown as File);
    expect(result).toBeNull();
    expect(logger.error).toHaveBeenCalledWith(
      'Main class not found in plugin.yml',
      {
        pluginYaml: expect.objectContaining({
          name: 'TestPlugin',
          version: '1.0.0',
        }),
      },
    );
  });

  it('should handle plugin.yml with full metadata', async () => {
    const mockFile = createMockJarFile([
      {
        name: 'plugin.yml',
        content: `
name: TestPlugin
main: com.example.TestPlugin
version: 1.0.0
api-version: 1.16
description: A test plugin
author: TestAuthor
commands:
  test:
    description: A test command
    usage: /test
`,
      },
    ]);

    const result = await getMainClassFromJar(mockFile as unknown as File);
    expect(result).toBe('com.example.TestPlugin');
  });

  it('should handle invalid ZIP file', async () => {
    const mockFile = {
      arrayBuffer: async () => new ArrayBuffer(10),
      name: 'test.jar',
      type: 'application/java-archive',
    };

    const result = await getMainClassFromJar(mockFile as unknown as File);
    expect(result).toBeNull();
    expect(logger.error).toHaveBeenCalledWith(
      'Invalid JAR file: plugin.yml not found',
    );
  });
});
