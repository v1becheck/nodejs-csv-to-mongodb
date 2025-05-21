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

export const validateConfig = () => {
  requiredVars.forEach((varName) => {
    const value = process.env[varName];
    if (!value) {
      throw new Error(`Missing required environment variable: ${varName}`);
    }

    if (varName.endsWith('_CSV')) {
      const resolvedPath = path.resolve(value);
      if (!fs.existsSync(resolvedPath)) {
        throw new Error(`CSV file not found: ${resolvedPath}`);
      }
    }
  });

  const batchSize = parseInt(process.env.BATCH_SIZE || '100');
  if (isNaN(batchSize) || batchSize <= 0) {
    throw new Error('BATCH_SIZE must be a positive integer');
  }

  console.log('Configuration validated successfully\n');
};
