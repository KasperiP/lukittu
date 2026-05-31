import { logger } from '@lukittu/shared';
import 'server-only';
import { inflateRawSync } from 'zlib';

interface PluginYaml {
  name: string;
  main: string;
  version: string;
  'api-version'?: string;
  description?: string;
  author?: string;
  commands?: Record<
    string,
    {
      description: string;
      usage: string;
    }
  >;
}

interface ZipEntry {
  filename: string;
  compressed: Buffer;
  compressedSize: number;
  uncompressedSize: number;
  compression: number;
}

/**
 * Simple YAML parser for plugin.yml format
 * Note: This is a basic implementation that handles the specific format of plugin.yml
 */
function parseYaml(yaml: string): PluginYaml {
  const result: Record<string, any> = {};

  const lines = yaml.split('\n');

  for (const line of lines) {
    if (!line.trim()) continue;

    const spaces = line.match(/^\s*/)?.[0].length ?? 0;
    const content = line.trim();

    if (content.startsWith('#')) continue; // Skip comments

    if (spaces === 0) {
      // Top level key-value pair
      const [key, ...valueParts] = content.split(':');
      const value = valueParts.join(':').trim();
      if (value) {
        // Remove quotes if present
        result[key] = value.replace(/^['"](.*)['"]$/, '$1');
      }
    }
  }

  return result as PluginYaml;
}

// ZIP record signatures
const EOCD_SIGNATURE = 0x06054b50; // End of Central Directory
const CD_SIGNATURE = 0x02014b50; // Central Directory file header
const LOCAL_SIGNATURE = 0x04034b50; // Local file header

/**
 * Locates a single entry by name through the ZIP central directory and returns
 * its still-compressed data plus metadata, or null if not present.
 */
function findZipEntry(data: Buffer, targetName: string): ZipEntry | null {
  // Find the End of Central Directory Record (EOCD). It is a 22-byte trailer
  // followed by an optional comment of at most 65535 bytes, so it can only live
  // in the last (22 + 65535) bytes of the file. Bounding the backwards scan to
  // that window keeps this O(64KB) instead of O(fileSize) — a full-file scan
  // pinned a CPU core for ~100s on large JARs and blocked the event loop.
  const MAX_EOCD_SIZE = 22 + 0xffff;
  const scanStart = Math.max(0, data.length - MAX_EOCD_SIZE);
  let cdOffset = -1;
  for (let i = data.length - 22; i >= scanStart; i--) {
    if (data.readUInt32LE(i) === EOCD_SIGNATURE) {
      cdOffset = data.readUInt32LE(i + 16);
      break;
    }
  }

  if (cdOffset < 0) {
    throw new Error('Invalid ZIP file: End of Central Directory not found');
  }

  // Walk the central directory. Each header is >= 46 bytes, so offset strictly
  // increases and the loop is guaranteed to terminate.
  let offset = cdOffset;
  while (
    offset + 46 <= data.length &&
    data.readUInt32LE(offset) === CD_SIGNATURE
  ) {
    const compression = data.readUInt16LE(offset + 10);
    const compressedSize = data.readUInt32LE(offset + 20);
    const uncompressedSize = data.readUInt32LE(offset + 24);
    const fileNameLength = data.readUInt16LE(offset + 28);
    const extraFieldLength = data.readUInt16LE(offset + 30);
    const fileCommentLength = data.readUInt16LE(offset + 32);
    const localHeaderOffset = data.readUInt32LE(offset + 42);

    const filename = data
      .subarray(offset + 46, offset + 46 + fileNameLength)
      .toString('utf8');

    if (filename === targetName) {
      // The data offset MUST come from the local file header: its name and
      // extra-field lengths can differ from the central directory's (extra
      // fields are commonly added for alignment/zipalign). Deriving it from the
      // central record's lengths produces a wrong offset for valid JARs.
      if (
        localHeaderOffset + 30 > data.length ||
        data.readUInt32LE(localHeaderOffset) !== LOCAL_SIGNATURE
      ) {
        throw new Error('Invalid ZIP file: bad local file header');
      }

      const localNameLength = data.readUInt16LE(localHeaderOffset + 26);
      const localExtraLength = data.readUInt16LE(localHeaderOffset + 28);
      const dataStart =
        localHeaderOffset + 30 + localNameLength + localExtraLength;
      const dataEnd = dataStart + compressedSize;

      if (dataEnd > data.length) {
        throw new Error('Invalid ZIP file: entry data out of bounds');
      }

      return {
        filename,
        compressed: data.subarray(dataStart, dataEnd),
        compressedSize,
        uncompressedSize,
        compression,
      };
    }

    offset += 46 + fileNameLength + extraFieldLength + fileCommentLength;
  }

  return null;
}

// NOTE: reads the whole file into memory (bounded by MAX_RELEASE_FILE_SIZE).
// True minimal I/O would range-read only the central directory + plugin.yml,
// but the upload is already capped so the simpler full-buffer read is fine.
export async function getMainClassFromJar(file: File): Promise<string | null> {
  try {
    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    const pluginYmlEntry = findZipEntry(buffer, 'plugin.yml');
    if (!pluginYmlEntry) {
      logger.error('Invalid JAR file: plugin.yml not found');
      return null;
    }

    // plugin.yml is a small text manifest; guard against a zip-bomb entry
    // (tiny compressed, huge uncompressed). The declared uncompressedSize is
    // attacker-controlled and may lie, so maxOutputLength below is the real cap.
    const MAX_PLUGIN_YML_SIZE = 1024 * 1024; // 1 MB
    if (pluginYmlEntry.uncompressedSize > MAX_PLUGIN_YML_SIZE) {
      logger.error('plugin.yml too large', {
        uncompressedSize: pluginYmlEntry.uncompressedSize,
      });
      return null;
    }

    let content: Buffer;
    if (pluginYmlEntry.compression === 0) {
      content = pluginYmlEntry.compressed;
    } else {
      content = inflateRawSync(pluginYmlEntry.compressed, {
        maxOutputLength: MAX_PLUGIN_YML_SIZE,
      });
    }

    const yamlContent = content.toString('utf8');
    const pluginYaml = parseYaml(yamlContent);

    if (!pluginYaml.main) {
      logger.error('Main class not found in plugin.yml', { pluginYaml });
      return null;
    }

    return pluginYaml.main;
  } catch (error) {
    logger.error('Failed to read JAR file', { error });
    return null;
  }
}
