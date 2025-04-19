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

// Function to compare two arrays of keys and return the difference
function compareKeys(keysA, keysB) {
  return keysA.filter((key) => !keysB.includes(key));
}

// Read all .json files in the current directory
const directoryPath = path.join(__dirname);
const files = fs
  .readdirSync(directoryPath)
  .filter((file) => file.endsWith('.json'));

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

// Compare the keys of all files
const fileKeys = {};
for (const [fileName, content] of Object.entries(fileContents)) {
  fileKeys[fileName] = getAllKeys(content).sort();
}

// Compare all the keys to ensure they match
const allFiles = Object.keys(fileKeys);
const firstFile = allFiles[0];
let hasMismatch = false;

for (let i = 1; i < allFiles.length; i++) {
  const currentFile = allFiles[i];
  const missingInCurrent = compareKeys(
    fileKeys[firstFile],
    fileKeys[currentFile],
  );
  const missingInFirst = compareKeys(
    fileKeys[currentFile],
    fileKeys[firstFile],
  );

  if (missingInCurrent.length > 0 || missingInFirst.length > 0) {
    console.error(`Mismatch found between ${firstFile} and ${currentFile}:`);
    if (missingInCurrent.length > 0) {
      console.error(`  Keys missing in ${currentFile}:`, missingInCurrent);
    }
    if (missingInFirst.length > 0) {
      console.error(`  Keys missing in ${firstFile}:`, missingInFirst);
    }
    hasMismatch = true;
  }
}

if (!hasMismatch) {
  console.log('All translation files have matching keys.');
} else {
  process.exit(1);
}
