import fs from 'fs';
import path from 'path';
import csv from 'csv-parser';

export const loadCSV = async <T extends Record<string, any>>(
  filePath: string,
  requiredHeaders: string[] = []
): Promise<T[]> => {
  const resolvedPath = path.resolve(filePath);
  if (!fs.existsSync(resolvedPath)) {
    throw new Error(`CSV file not found: ${resolvedPath}`);
  }

  return new Promise((resolve, reject) => {
    const results: T[] = [];
    let headersChecked = false;

    fs.createReadStream(resolvedPath)
      .pipe(csv())
      .on('headers', (headers: string[]) => {
        requiredHeaders.forEach((header) => {
          if (!headers.includes(header)) {
            reject(new Error(`Missing required column "${header}" in CSV`));
          }
        });
        headersChecked = true;
      })
      .on('data', (data: T) => results.push(data))
      .on('end', () => {
        if (!headersChecked) reject(new Error('CSV file is empty'));
        if (results.length === 0) console.warn('⚠️  CSV file contains no data');
        resolve(results);
      })
      .on('error', reject);
  });
};
