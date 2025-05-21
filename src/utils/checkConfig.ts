import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';

dotenv.config();

const requiredVars = [
  'MONGO_URI',
  'CATEGORIES_CSV',
  'VENDORS_CSV',
  'PRODUCTS_CSV',
] as const;

(() => {
  // Validate env variables
  requiredVars.forEach((varName) => {
    if (!process.env[varName]) {
      throw new Error(`Missing required environment variable: ${varName}`);
    }
  });

  // Validate CSV paths existance
  [
    process.env.CATEGORIES_CSV,
    process.env.VENDORS_CSV,
    process.env.PRODUCTS_CSV,
  ].forEach((filePath) => {
    const resolvedPath = path.resolve(filePath!);
    if (!fs.existsSync(resolvedPath)) {
      throw new Error(`CSV file not found: ${resolvedPath}`);
    }
  });

  // Validate batch size
  const batchSize = parseInt(process.env.BATCH_SIZE || '100');
  if (isNaN(batchSize) || batchSize <= 0) {
    throw new Error('BATCH_SIZE must be a positive integer');
  }

  console.log('Configuration validated successfully');
})();
