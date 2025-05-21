import { connectDB, disconnectDB } from '../utils/db';
import { loadCSV } from '../utils/csvLoader';
import { validateConfig } from '../utils/checkConfig';
import { AnyBulkWriteOperation } from 'mongodb';

interface VendorRow {
  VENDOR_ID: string;
  VENDOR_NAME: string;
  CREATE_DATE: string;
  LAST_MODIFIED_DATE: string;
}

interface VendorDoc {
  _id: string;
  name: string;
  createdAt: Date;
  updatedAt: Date;
}

const parseVendorDate = (s: string): Date => {
  const [m, d, y] = s.split('/').map(Number);
  if (m < 1 || m > 12 || d < 1 || d > 31 || y < 2000) {
    throw new Error(`Invalid date: ${s}`);
  }
  return new Date(y, m - 1, d);
};

(async () => {
  try {
    validateConfig();

    console.time('Vendors Migration');
    const mongoose = await connectDB();
    const db = mongoose.connection.db!;

    const skipStats = {
      total: 0,
      invalidDates: 0,
      otherErrors: 0,
      examples: [] as string[],
    };

    const rows = await loadCSV<VendorRow>(process.env.VENDORS_CSV!, [
      'VENDOR_ID',
      'VENDOR_NAME',
      'CREATE_DATE',
      'LAST_MODIFIED_DATE',
    ]);

    const maybeOps = rows.map((v) => {
      try {
        const doc: VendorDoc = {
          _id: v.VENDOR_ID,
          name: v.VENDOR_NAME,
          createdAt: parseVendorDate(v.CREATE_DATE),
          updatedAt: parseVendorDate(v.LAST_MODIFIED_DATE),
        };
        return {
          updateOne: {
            filter: { _id: doc._id },
            update: { $set: doc },
            upsert: true,
          },
        } as AnyBulkWriteOperation<VendorDoc>;
      } catch (err) {
        skipStats.total++;
        if (err instanceof Error && err.message.includes('Invalid date')) {
          skipStats.invalidDates++;
        } else {
          skipStats.otherErrors++;
        }

        if (skipStats.examples.length < 5) {
          skipStats.examples.push(
            `Vendor ${v.VENDOR_ID}: ${err instanceof Error ? err.message : err}`
          );
        }

        return null;
      }
    });

    const ops = maybeOps.filter(
      (o): o is AnyBulkWriteOperation<VendorDoc> => !!o
    );

    if (!ops.length) throw new Error('No valid vendors to migrate');

    const result = await db.collection<VendorDoc>('vendors').bulkWrite(ops);

    console.log(
      '\n----------------------------------------------------------------\n'
    );
    console.log(
      `Migrated ${result.upsertedCount + result.modifiedCount}/${
        rows.length
      } vendors`
    );
    console.log(
      '\n----------------------------------------------------------------\n'
    );

    if (skipStats.total > 0) {
      console.log('Skip Statistics:');
      console.log(`- Total skipped: ${skipStats.total}`);
      console.log(`- Invalid date fields: ${skipStats.invalidDates}`);
      console.log(`- Other errors: ${skipStats.otherErrors}`);
      console.log('\nExample skipped vendors:');
      skipStats.examples.forEach((ex) => console.log(`  ${ex}`));
    }
  } catch (err) {
    console.error(
      'Vendors migration failed:',
      err instanceof Error ? err.message : err
    );
    process.exit(1);
  } finally {
    await disconnectDB();
    console.timeEnd('Vendors Migration');
  }
})();
