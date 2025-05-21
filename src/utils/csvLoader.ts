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
      .pipe(
        csv({
          mapHeaders: ({ header }) => header.trim(),
          quote: '',
          skipLines: 0,
        })
      )
      .on('headers', (headers: string[]) => {
        for (const header of requiredHeaders) {
          if (!headers.includes(header)) {
            return reject(
              new Error(`Missing required column "${header}" in CSV`)
            );
          }
        }
        headersChecked = true;
      })
      .on('data', (row: T) => {
        if (Object.values(row).every((v) => v === '')) return;
        results.push(row);
      })
      .on('end', () => {
        if (!headersChecked) {
          return reject(
            new Error('CSV file is empty or malformed (no headers found)')
          );
        }
        if (results.length === 0) {
          console.warn('⚠️  CSV file contains no data rows');
        }
        resolve(results);
      })
      .on('error', reject);
  });
};
