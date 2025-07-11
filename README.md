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

4. **Run the migrations**

   ```bash
    npm run migrate:categories
    npm run migrate:vendors
    npm run migrate:products
   ```

   _Run in the order of categories, vendors, and products to ensure dependencies are met._

## Notes

- CSV files must match expected headers
- MongoDB connection is automatically retried
- The script will log the number of records processed and any errors encountered during the migration process.
- Since there are 81 products with missing vendor IDs, the script will store those products with _"(empty)"_ vendor ID and save them into csv file for easy lookup.
  - VENDOR_ID is set to nullable for this reason.
