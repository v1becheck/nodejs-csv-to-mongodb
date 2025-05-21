import { connectDB, disconnectDB } from '../utils/db';
import { loadCSV } from '../utils/csvLoader';
import dotenv from 'dotenv';
import { AnyBulkWriteOperation } from 'mongodb';

dotenv.config();

interface ProductRow {
  SKU: string;
  MANUFACTURER_PART_NO: string;
  PRODUCT_NAME: string;
  VENDOR: string;
  DESCRIPTION: string;
  ACTIVE_STATUS: string;
  DISCONTINUED: string;
  CREATED_DATE: string;
  LAST_MODIFIED_DATE: string;
  COLOR: string;
  CATEGORY_CODE: string;
}

interface ProductDoc {
  _id: string;
  manufacturerPartNumber?: string;
  name: string;
  description: string;
  color?: string;
  active: boolean;
  discontinued: boolean;
  createdAt: Date;
  updatedAt: Date;
  vendor: { _id: string; name: string };
  category: { _id: string; name: string };
}

const parseProductDate = (s: string): Date => {
  if (!/^\d{8}$/.test(s)) throw new Error(`Wrong format: ${s}`);
  const y = +s.slice(0, 4),
    m = +s.slice(4, 6) - 1,
    d = +s.slice(6, 8);
  if (m < 0 || m > 11 || d < 1 || d > 31) throw new Error(`Invalid date: ${s}`);
  return new Date(y, m, d);
};

(async () => {
  console.time('Products Migration');
  const mongoose = await connectDB();
  const db = mongoose.connection.db!;

  try {
    const products = await loadCSV<ProductRow>(process.env.PRODUCTS_CSV!, [
      'SKU',
      'PRODUCT_NAME',
      'VENDOR',
      'CATEGORY_CODE',
    ]);
    const batchSize = +process.env.BATCH_SIZE! || 100;

    const [vendors, categories] = await Promise.all([
      db.collection<{ _id: string; name: string }>('vendors').find().toArray(),
      db
        .collection<{ _id: string; name: string }>('categories')
        .find()
        .toArray(),
    ]);
    const vendorMap = new Map(vendors.map((v) => [v._id, v]));
    const categoryMap = new Map(categories.map((c) => [c._id, c]));

    const skipStats = {
      total: 0,
      missingVendor: 0,
      missingCategory: 0,
      missingBoth: 0,
      otherErrors: 0,
      examples: [] as string[],
    };

    for (let i = 0; i < products.length; i += batchSize) {
      const batch = products.slice(i, i + batchSize);

      const maybeOps = batch.map((p) => {
        try {
          const vendor = vendorMap.get(p.VENDOR);
          const category = categoryMap.get(p.CATEGORY_CODE);

          if (!vendor || !category) {
            const missingVendor = !vendor;
            const missingCategory = !category;

            skipStats.total++;
            if (missingVendor && missingCategory) skipStats.missingBoth++;
            else if (missingVendor) skipStats.missingVendor++;
            else if (missingCategory) skipStats.missingCategory++;

            if (skipStats.examples.length < 5) {
              skipStats.examples.push(
                `SKU ${p.SKU}: ${missingVendor ? 'Missing vendor' : ''} ${
                  missingCategory ? 'Missing category' : ''
                }`
              );
            }

            throw new Error(
              `Missing ref (vendor:${!!vendor},cat:${!!category})`
            );
          }

          const doc: ProductDoc = {
            _id: p.SKU,
            manufacturerPartNumber: p.MANUFACTURER_PART_NO || undefined,
            name: p.PRODUCT_NAME,
            description: p.DESCRIPTION,
            color: p.COLOR || undefined,
            active: p.ACTIVE_STATUS.toLowerCase() === 'yes',
            discontinued: p.DISCONTINUED.toLowerCase() === 'yes',
            createdAt: parseProductDate(p.CREATED_DATE),
            updatedAt: parseProductDate(p.LAST_MODIFIED_DATE),
            vendor: { _id: vendor._id, name: vendor.name },
            category: { _id: category._id, name: category.name },
          };

          return {
            updateOne: {
              filter: { _id: doc._id },
              update: { $set: doc },
              upsert: true,
            },
          } as AnyBulkWriteOperation<ProductDoc>;
        } catch (err) {
          if (!(err instanceof Error && err.message.includes('Missing ref'))) {
            skipStats.otherErrors++;
          }
          return null;
        }
      });

      const ops = maybeOps.filter(
        Boolean
      ) as AnyBulkWriteOperation<ProductDoc>[];
      if (ops.length) {
        await db.collection<ProductDoc>('products').bulkWrite(ops);
      }
    }

    console.log(
      '\n----------------------------------------------------------------\n'
    );
    console.log(
      `Migrated ${products.length - skipStats.total}/${
        products.length
      } products`
    );

    if (skipStats.total > 0) {
      console.log(
        '\n----------------------------------------------------------------\n'
      );
      console.log('Skip Statistics:');
      console.log(`- Total skipped: ${skipStats.total}`);
      console.log(`- Missing vendor only: ${skipStats.missingVendor}`);
      console.log(`- Missing category only: ${skipStats.missingCategory}`);
      console.log(`- Missing both: ${skipStats.missingBoth}`);
      console.log(`- Other errors: ${skipStats.otherErrors}`);
      console.log('\nExample skipped items:');
      skipStats.examples.forEach((ex) => console.log(`  ${ex}`));
      console.log(
        '\n----------------------------------------------------------------'
      );
    }
  } catch (err) {
    console.error(
      'Products migration failed:',
      err instanceof Error ? err.message : err
    );
    process.exit(1);
  } finally {
    await disconnectDB();
    console.timeEnd('Products Migration');
  }
})();
