# CSV to MongoDB Migration Tool

A TypeScript-based tool for migrating CSV data into MongoDB with hierarchical category support.

## Prerequisites

- Node.js v18+
- MongoDB running locally
- CSV files in `./data/` directory

## Quick Start

1. **Set up MongoDB locally**

   Make sure you have MongoDB running on your local machine.

2. **Install dependencies**

   ```bash
   npm install
   ```

3. **Configure environment** (create .env file)

   ```bash
   MONGO_URI=mongodb://localhost:27017/<add_db_name>
   CATEGORIES_CSV=./data/categories.csv
   VENDORS_CSV=./data/vendors.csv
   PRODUCTS_CSV=./data/products.csv
   BATCH_SIZE=100
   ```

4. **Validate configuration**

   ```bash
   npm run check-config
   ```

5. **Run the migrations**

   ```bash
    npm run migrate:categories
    npm run migrate:vendors
    npm run migrate:products
   ```

   Run in the order of categories, vendors, and products to ensure dependencies are met.

## Notes

- CSV files must match expected headers
- MongoDB connection is automatically retried
- Invalid records are skipped with warnings
