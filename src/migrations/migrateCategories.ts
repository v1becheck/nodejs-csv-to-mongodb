import { connectDB, disconnectDB } from '../utils/db';
import { loadCSV } from '../utils/csvLoader';
import { validateConfig } from '../utils/checkConfig';
import { AnyBulkWriteOperation } from 'mongodb';

interface CategoryRow {
  CATEGORY_CODE: string;
  CATEGORY_NAME: string;
}

interface CategoryDoc {
  _id: string;
  name: string;
}

const validateCategoryCode = (code: string): boolean =>
  /^\d{2,}$/.test(code) && code.length % 2 === 0;

const buildCategoryTree = (categories: CategoryRow[]) => {
  const nodeMap = new Map<string, any>();

  categories
    .sort((a, b) => a.CATEGORY_CODE.length - b.CATEGORY_CODE.length)
    .forEach(({ CATEGORY_CODE, CATEGORY_NAME }) => {
      const node = {
        _id: CATEGORY_CODE,
        name: CATEGORY_NAME,
        children: nodeMap.get(CATEGORY_CODE)?.children || [],
      };

      nodeMap.set(CATEGORY_CODE, node);

      if (CATEGORY_CODE.length > 2) {
        const parentCode = CATEGORY_CODE.slice(0, -2);
        const parent = nodeMap.get(parentCode);
        if (parent) {
          parent.children.push(node);
        }
      }
    });

  return Array.from(nodeMap.values()).filter((n) => n._id.length === 2);
};

(async () => {
  try {
    validateConfig();

    console.time('Categories Migration');
    const mongoose = await connectDB();
    const db = mongoose.connection.db!;
    const col = db.collection<CategoryDoc>('categories');

    const skipStats = {
      total: 0,
      examples: [] as string[],
    };

    const rows = await loadCSV<CategoryRow>(process.env.CATEGORIES_CSV!, [
      'CATEGORY_CODE',
      'CATEGORY_NAME',
    ]);

    const valid = rows.filter((r) => {
      const isValid = validateCategoryCode(r.CATEGORY_CODE);
      if (!isValid) {
        skipStats.total++;
        if (skipStats.examples.length < 5) {
          skipStats.examples.push(
            `Category ${r.CATEGORY_CODE}: invalid format`
          );
        }
      }
      return isValid;
    });

    if (valid.length === 0) throw new Error('No valid categories found');

    const writes: AnyBulkWriteOperation<CategoryDoc>[] = valid.map((r) => ({
      updateOne: {
        filter: { _id: r.CATEGORY_CODE },
        update: { $set: { name: r.CATEGORY_NAME } },
        upsert: true,
      },
    }));

    await col.bulkWrite(writes, { ordered: false });

    const treeRoots = buildCategoryTree(valid);
    await db
      .collection<{ _id: string; children: any[] }>('categoryTree')
      .updateOne(
        { _id: 'categoryTree' },
        { $set: { children: treeRoots } },
        { upsert: true }
      );

    console.log(
      '\n----------------------------------------------------------------\n'
    );
    console.log(`Migrated ${valid.length}/${rows.length} categories`);
    console.log(
      '\n----------------------------------------------------------------'
    );

    if (skipStats.total > 0) {
      console.log('\nSkip Statistics:');
      console.log(`- Total skipped: ${skipStats.total}`);
      console.log('\nExample skipped categories:');
      skipStats.examples.forEach((ex) => console.log(`  ${ex}`));
    }
  } catch (err) {
    console.error(
      'Category migration failed:',
      err instanceof Error ? err.message : err
    );
    process.exit(1);
  } finally {
    await disconnectDB();
    console.timeEnd('Categories Migration');
  }
})();
