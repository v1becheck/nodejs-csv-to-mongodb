import { connectDB, disconnectDB } from '../utils/db';
import { loadCSV } from '../utils/csvLoader';
import { validateConfig } from '../utils/checkConfig';
import { AnyBulkWriteOperation } from 'mongodb';

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
  if (!/^\d{8}$/.test(s)) throw new Error(`Invalid date format: ${s}`);

  const monthStr = s.slice(4, 6);
  const dayStr = s.slice(6, 8);
  const month = parseInt(monthStr, 10);
  const day = parseInt(dayStr, 10);

  if (month < 1 || month > 12) throw new Error(`Invalid month: ${monthStr}`);
  if (day < 1 || day > 31) throw new Error(`Invalid day: ${dayStr}`);

  return new Date(parseInt(s.slice(0, 4)), month - 1, parseInt(dayStr));
};

(async () => {
  try {
    validateConfig();

    console.time('Products Migration');
    const mongoose = await connectDB();
    const db = mongoose.connection.db!;

    const [vendorCount, categoryCount] = await Promise.all([
      db.collection('vendors').countDocuments(),
      db.collection('categories').countDocuments(),
    ]);

    if (vendorCount === 0 || categoryCount === 0) {
      throw new Error(
        'Required vendor/category collections are empty - run those migrations first'
      );
    }

    const products = await loadCSV<ProductRow>(process.env.PRODUCTS_CSV!, [
      'SKU',
      'PRODUCT_NAME',
      'VENDOR',
      'CATEGORY_CODE',
      'ACTIVE_STATUS',
      'DISCONTINUED',
      'CREATED_DATE',
      'LAST_MODIFIED_DATE',
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

    for (const batch of chunkArray(products, batchSize)) {
      const ops: AnyBulkWriteOperation<ProductDoc>[] = [];

      for (const p of batch) {
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
                }`.trim()
              );
            }
            continue;
          }

          ops.push({
            updateOne: {
              filter: { _id: p.SKU },
              update: {
                $set: {
                  _id: p.SKU,
                  manufacturerPartNumber: p.MANUFACTURER_PART_NO || undefined,
                  name: p.PRODUCT_NAME,
                  description: p.DESCRIPTION,
                  color: p.COLOR || undefined,
                  active:
                    String(p.ACTIVE_STATUS).trim().toLowerCase() === 'yes',
                  discontinued:
                    String(p.DISCONTINUED).trim().toLowerCase() === 'yes',
                  createdAt: parseProductDate(p.CREATED_DATE),
                  updatedAt: parseProductDate(p.LAST_MODIFIED_DATE),
                  vendor: { _id: vendor._id, name: vendor.name },
                  category: { _id: category._id, name: category.name },
                },
              },
              upsert: true,
            },
          });
        } catch (err) {
          skipStats.total++;
          skipStats.otherErrors++;
          if (skipStats.examples.length < 5) {
            skipStats.examples.push(
              `SKU ${p.SKU}: ${
                err instanceof Error ? err.message : 'Unknown error'
              }`
            );
          }
        }
      }

      if (ops.length > 0) {
        await db
          .collection<ProductDoc>('products')
          .bulkWrite(ops, { ordered: false });
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

function chunkArray<T>(array: T[], size: number): T[][] {
  const chunks = [];
  for (let i = 0; i < array.length; i += size) {
    chunks.push(array.slice(i, i + size));
  }
  return chunks;
}
