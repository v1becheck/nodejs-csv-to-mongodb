import mongoose from 'mongoose';
import dotenv from 'dotenv';

dotenv.config();

const MAX_RETRIES = 3;
const RETRY_DELAY_MS = 2000;

export const connectDB = async (): Promise<typeof mongoose> => {
  const uri = process.env.MONGO_URI;
  if (!uri) throw new Error('MONGO_URI not defined in .env');

  mongoose.set('strictQuery', true);

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      const conn = await mongoose.connect(uri, {
        serverSelectionTimeoutMS: 5000,
        socketTimeoutMS: 30000,
      });
      console.log(`MongoDB connected to ${conn.connection.host}`);
      return conn;
    } catch (error) {
      if (attempt === MAX_RETRIES) throw error;
      console.log(`Retrying connection (attempt ${attempt}/${MAX_RETRIES})...`);
      await new Promise((resolve) => setTimeout(resolve, RETRY_DELAY_MS));
    }
  }
  throw new Error('Failed to connect to MongoDB');
};

export const disconnectDB = async (): Promise<void> => {
  try {
    await mongoose.disconnect();
    console.log('\nMongoDB connection closed.\n');
  } catch (error) {
    console.error('Error closing MongoDB connection:', error);
  }
};
