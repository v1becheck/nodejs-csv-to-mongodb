# Node.js Backend Developer Assessment
**CSV to MongoDB Data Migration**

---

## Introduction

This task is designed to evaluate your backend development skills, specifically your ability to work with **Node.js**, **TypeScript**, **CSV parsing**, and **MongoDB**.

You will be working with three CSV files representing different resource types:

- Categories  
- Vendors  
- Products  

Your goal is to migrate the data from these files into a MongoDB database. Some migrations are simple inserts, while others require tree-building or relational lookups.

---

## General Requirements

- Use **Node.js** and **TypeScript**
- Use a **CSV parsing library** (e.g., `csv-parser`, `fast-csv`, etc.)
- Use **MongoDB**, either the native driver or **Mongoose**
- Implement proper error handling
- Provide **runnable scripts** for each migration (e.g., `npm run migrate:categories`)

---

## ✅ Task 1: Migrate Category Data

### 📥 Input: `categories.csv`

```csv
CATEGORY_CODE,CATEGORY_NAME,CREATE_DATE,LAST_MODIFIED_DATE
01,Dinnerware,00000000,00000000
0101,Select China,00000000,00000000
010101,Rego,00000000,00000000
...
```

### 📚 Category Hierarchy Explanation

Each `CATEGORY_CODE` represents a hierarchical relationship encoded in the code itself:

- `01`: top-level category  
- `0101`: subcategory of `01`  
- `010101`: subcategory of `0101`  
- `01010102`: subcategory of `010101`  

### 🧾 Requirements

Insert each category into the `categories` collection:

```ts
{
  _id: string,   // from CATEGORY_CODE
  name: string   // from CATEGORY_NAME
}
```

Build a nested tree of categories and insert it as a single document in the `categoryTree` collection:

```ts
{
  _id: "categoryTree",
  children: [
    {
      _id: "01",
      name: "Dinnerware",
      children: [
        {
          _id: "0101",
          name: "Select China",
          children: [
            {
              _id: "010101",
              name: "Rego",
              children: [
                { _id: "01010102", name: "Bright White", children: [] }
              ]
            }
          ]
        }
      ]
    }
  ]
}
```

---

## ✅ Task 2: Migrate Vendor Data

### 📥 Input: `vendors.csv`

```csv
VENDOR_ID,VENDOR_NAME,CREATE_DATE,LAST_MODIFIED_DATE
34,MARSAL & SONS,11/18/2020,9/23/2020
...
```

### 🧾 Requirements

Insert each row into the `vendors` collection:

```ts
{
  _id: string,       // from VENDOR_ID
  name: string,      // from VENDOR_NAME
  createdAt: Date,   // parsed from CREATE_DATE
  updatedAt: Date    // parsed from LAST_MODIFIED_DATE
}
```

---

## ✅ Task 3: Migrate Product Data

### 📥 Input: `products.csv`

```csv
SKU,MANUFACTURER_PART_NO,PRODUCT_NAME,VENDOR,DESCRIPTION,ACTIVE_STATUS,DISCONTINUED,CREATED_DATE,LAST_MODIFIED_DATE,COLOR,CATEGORY_CODE
...
```

Each row represents a product. The goal is to migrate these into the `products` collection with proper field mapping and data transformation.

---

### 🧾 Field Mapping and Explanation

| CSV Column            | MongoDB Field             | Type     | Description |
|-----------------------|---------------------------|----------|-------------|
| `SKU`                 | `_id`                     | `string` | Unique identifier of the product. Use this as the MongoDB `_id`. |
| `MANUFACTURER_PART_NO`| `manufacturerPartNumber`  | `string` | Manufacturer's part number for reference. |
| `PRODUCT_NAME`        | `name`                    | `string` | Display name of the product. |
| `DESCRIPTION`         | `description`             | `string` | Short description of the product. |
| `COLOR`               | `color`                   | `string` | Color of the product if available. |
| `ACTIVE_STATUS`       | `active`                  | `boolean`| `"Yes"` → `true`, `"No"` → `false`. Indicates if the product is currently active. |
| `DISCONTINUED`        | `discontinued`            | `boolean`| `"Yes"` → `true`, `"No"` → `false`. Indicates if the product has been discontinued. |
| `CREATED_DATE`        | `createdAt`               | `Date`   | Format: `YYYYMMDD`. Convert to a JavaScript `Date` object. |
| `LAST_MODIFIED_DATE`  | `updatedAt`               | `Date`   | Format: `YYYYMMDD`. Convert to a JavaScript `Date` object. |
| `VENDOR`              | `vendor`                  | `object` | Lookup from vendors collection. Embed as `{ _id, name }`. |
| `CATEGORY_CODE`       | `category`                | `object` | Lookup from categories collection. Embed as `{ _id, name }`. |

---

### 🧾 Expected Output Document

Each product should be inserted into the `products` collection in the following structure:

```ts
{
  _id: string,
  manufacturerNumber?: string,
  name: string,
  description: string,
  color?: string,
  active: boolean,
  discontinued: boolean,
  createdAt: Date,
  updatedAt: Date,
  vendor: {
    _id: string,
    name: string
  },
  category: {
    _id: string,
    name: string
  }
}
```

---

## 📦 Expected Deliverables

- Migration scripts for each file:
  - `npm run migrate:categories`
  - `npm run migrate:vendors`
  - `npm run migrate:products`
- Code should be clean and modular where possible.