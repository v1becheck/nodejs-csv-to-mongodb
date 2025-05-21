import { connectDB, disconnectDB } from '../utils/db';
import fs from 'fs';
import path from 'path';
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
  vendor: { _id: string; name: string } | null;
  category: { _id: string; name: string };
}

const stripZeros = (id: string) => id.replace(/^0+/, '');

const parseProductDate = (s: string): Date => {
  if (!/^\d{8}$/.test(s)) throw new Error(`Invalid date format: ${s}`);
  const y = Number(s.slice(0, 4));
  const m = Number(s.slice(4, 6)) - 1;
  const d = Number(s.slice(6, 8));
  return new Date(y, m, d);
};

const chunkArray = <T>(arr: T[], size: number): T[][] => {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
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
      throw new Error('Run vendor & category migrations first');
    }

    const products = await loadCSV<ProductRow>(process.env.PRODUCTS_CSV!, [
      'SKU',
      'PRODUCT_NAME',
      'VENDOR',
      'CATEGORY_CODE',
    ]);
    const batchSize = Number(process.env.BATCH_SIZE ?? 100);

    const [vendors, categories] = await Promise.all([
      db.collection<{ _id: string; name: string }>('vendors').find().toArray(),
      db
        .collection<{ _id: string; name: string }>('categories')
        .find()
        .toArray(),
    ]);

    const vendorMap = new Map<string, { _id: string; name: string }>();
    vendors.forEach((v) => {
      vendorMap.set(v._id, v);
      vendorMap.set(stripZeros(v._id), v);
    });

    const categoryMap = new Map<string, { _id: string; name: string }>();
    categories.forEach((c) => {
      categoryMap.set(c._id, c);
      categoryMap.set(stripZeros(c._id), c);
    });

    const skipStats = {
      skippedRows: 0,
      missingVendor: 0,
      missingCategory: 0,
      missingBoth: 0,
      otherErrors: 0,
      examples: [] as string[],
    };
    const missingVendorRows: ProductRow[] = [];

    // BATCH PROCESSING
    for (const batch of chunkArray(products, batchSize)) {
      const ops: AnyBulkWriteOperation<ProductDoc>[] = [];

      for (const p of batch) {
        try {
          const vendor =
            vendorMap.get(p.VENDOR) || vendorMap.get(stripZeros(p.VENDOR));
          const category =
            categoryMap.get(p.CATEGORY_CODE) ||
            categoryMap.get(stripZeros(p.CATEGORY_CODE));

          if (!category) {
            skipStats.skippedRows++;
            skipStats.missingCategory++;
            if (!vendor) skipStats.missingVendor++;
            if (skipStats.examples.length < 5) {
              skipStats.examples.push(
                `SKU ${p.SKU}: ${
                  !vendor ? 'Missing vendor ' : ''
                }Missing category`
              );
            }
            continue;
          }

          if (!vendor) {
            skipStats.missingVendor++;
            missingVendorRows.push({ ...p, VENDOR: p.VENDOR || '(empty)' });
            if (skipStats.examples.length < 5) {
              skipStats.examples.push(`SKU ${p.SKU}: Missing vendor`);
            }
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
                  active: /^yes$/i.test(p.ACTIVE_STATUS),
                  discontinued: /^yes$/i.test(p.DISCONTINUED),
                  createdAt: parseProductDate(p.CREATED_DATE),
                  updatedAt: parseProductDate(p.LAST_MODIFIED_DATE),
                  vendor: vendor
                    ? { _id: vendor._id, name: vendor.name }
                    : null,
                  category: { _id: category._id, name: category.name },
                },
              },
              upsert: true,
            },
          });
        } catch (err) {
          skipStats.skippedRows++;
          skipStats.otherErrors++;
          if (skipStats.examples.length < 5) {
            skipStats.examples.push(`SKU ${p.SKU}: ${(err as Error).message}`);
          }
        }
      }

      if (ops.length) {
        await db
          .collection<ProductDoc>('products')
          .bulkWrite(ops, { ordered: false });
      }
    }

    // REPORT
    console.log(
      '\n----------------------------------------------------------------'
    );
    console.log(
      `Migrated ${products.length - skipStats.skippedRows}/${
        products.length
      } products`
    );
    if (skipStats.skippedRows || skipStats.missingVendor) {
      console.log('Stats:', skipStats);
      skipStats.examples.forEach((ex) => console.log('  ', ex));
    }
    if (missingVendorRows.length) {
      const outPath = path.resolve(process.cwd(), 'data/missing_vendors.csv');
      const header = [
        'SKU',
        'MANUFACTURER_PART_NO',
        'PRODUCT_NAME',
        'VENDOR',
        'DESCRIPTION',
        'ACTIVE_STATUS',
        'DISCONTINUED',
        'CREATED_DATE',
        'LAST_MODIFIED_DATE',
        'COLOR',
        'CATEGORY_CODE',
      ];
      const csv = [
        header.join(','),
        ...missingVendorRows.map((r) =>
          header
            .map((h) => {
              const val = (r as any)[h] ?? '';
              return h === 'VENDOR' && val === ''
                ? '(empty)'
                : String(val).replace(/"/g, '""');
            })
            .join(',')
        ),
      ].join('\n');
      fs.writeFileSync(outPath, csv, 'utf8');
      console.log(
        `\n📄  Wrote list of ${missingVendorRows.length} missing‑vendor SKUs to ${outPath}`
      );
    }
    console.log(
      '----------------------------------------------------------------'
    );
  } catch (err) {
    console.error('Products migration failed:', (err as Error).message);
    process.exit(1);
  } finally {
    await disconnectDB();
    console.timeEnd('Products Migration');
  }
})();
