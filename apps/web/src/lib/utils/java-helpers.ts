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

/**
 * Reads ZIP central directory to locate files
 */
async function readZipEntries(data: Buffer): Promise<Map<string, ZipEntry>> {
  const entries = new Map<string, ZipEntry>();
  let offset = 0;

  for (let i = data.length - 22; i >= 0; i--) {
    if (data.readUInt32LE(i) === 0x06054b50) {
      offset = data.readUInt32LE(i + 16);
      break;
    }
  }

  while (offset < data.length) {
    const signature = data.readUInt32LE(offset);
    if (signature !== 0x02014b50) break;

    const compression = data.readUInt16LE(offset + 10);
    const compressedSize = data.readUInt32LE(offset + 20);
    const uncompressedSize = data.readUInt32LE(offset + 24);
    const fileNameLength = data.readUInt16LE(offset + 28);
    const extraFieldLength = data.readUInt16LE(offset + 30);
    const fileCommentLength = data.readUInt16LE(offset + 32);
    const localHeaderOffset = data.readUInt32LE(offset + 42);

    const filename = data
      .subarray(offset + 46, offset + 46 + fileNameLength)
      .toString();

    const localOffset = localHeaderOffset + 30 + fileNameLength;
    const compressed = data.subarray(localOffset, localOffset + compressedSize);

    entries.set(filename, {
      filename,
      compressed,
      compressedSize,
      uncompressedSize,
      compression,
    });

    offset += 46 + fileNameLength + extraFieldLength + fileCommentLength;
  }

  return entries;
}

// TODO: Optimize by not reading the entire file into memory
export async function getMainClassFromJar(file: File): Promise<string | null> {
  try {
    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    const entries = await readZipEntries(buffer);

    const pluginYmlEntry = entries.get('plugin.yml');
    if (!pluginYmlEntry) {
      logger.error('Invalid JAR file: plugin.yml not found');
      return null;
    }

    let content: Buffer;
    if (pluginYmlEntry.compression === 0) {
      content = pluginYmlEntry.compressed;
    } else {
      content = inflateRawSync(pluginYmlEntry.compressed);
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
