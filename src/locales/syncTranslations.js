const fs = require('fs');
const path = require('path');

// Function to get all keys of an object, including nested keys, in a sorted format
function getAllKeys(obj, prefix = '') {
  return Object.keys(obj).flatMap((key) => {
    const fullKey = prefix ? `${prefix}.${key}` : key;
    if (typeof obj[key] === 'object' && obj[key] !== null) {
      return getAllKeys(obj[key], fullKey);
    } else {
      return fullKey;
    }
  });
}

// Function to set a value at a nested path in an object
function setNestedValue(obj, path, value) {
  const parts = path.split('.');
  let current = obj;

  for (let i = 0; i < parts.length - 1; i++) {
    const part = parts[i];
    if (!current[part] || typeof current[part] !== 'object') {
      current[part] = {};
    }
    current = current[part];
  }

  const lastPart = parts[parts.length - 1];
  // Only set the value if it doesn't already exist
  if (current[lastPart] === undefined) {
    current[lastPart] = '';
  }
}

// Function to get a value at a nested path in an object
function getNestedValue(obj, path) {
  const parts = path.split('.');
  let current = obj;

  for (const part of parts) {
    if (current[part] === undefined) {
      return undefined;
    }
    current = current[part];
  }

  return current;
}

// Read all .json files in the current directory
const directoryPath = path.join(__dirname);
const files = fs
  .readdirSync(directoryPath)
  .filter((file) => file.endsWith('.json'));

// Check if en.json exists
if (!files.includes('en.json')) {
  console.error('Error: en.json not found in the directory.');
  process.exit(1);
}

// Load all JSON content
const fileContents = {};
for (const file of files) {
  const filePath = path.join(directoryPath, file);
  try {
    const content = fs.readFileSync(filePath, 'utf8');
    fileContents[file] = JSON.parse(content);
  } catch (err) {
    console.error(`Error reading or parsing file ${file}:`, err);
    process.exit(1);
  }
}

// Use en.json as the reference
const referenceKeys = getAllKeys(fileContents['en.json']);
let syncPerformed = false;

// Sync all other files with the reference
for (const file of files) {
  if (file === 'en.json') continue;

  const currentKeys = getAllKeys(fileContents[file]);
  const missingKeys = referenceKeys.filter((key) => !currentKeys.includes(key));

  if (missingKeys.length > 0) {
    console.log(`Adding ${missingKeys.length} missing keys to ${file}...`);

    // Add each missing key
    for (const key of missingKeys) {
      const englishValue = getNestedValue(fileContents['en.json'], key);
      setNestedValue(fileContents[file], key, englishValue);
    }

    // Write the updated file back
    const filePath = path.join(directoryPath, file);
    fs.writeFileSync(filePath, JSON.stringify(fileContents[file], null, 2));
    syncPerformed = true;
    console.log(`Updated ${file}`);
  } else {
    console.log(`${file} already contains all keys from en.json`);
  }
}

if (syncPerformed) {
  console.log('Translation synchronization complete.');
} else {
  console.log('All translation files already in sync with en.json.');
}
