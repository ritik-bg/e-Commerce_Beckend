import { MongoClient } from "mongodb";
import dotenv from 'dotenv';

dotenv.config();

const client = new MongoClient(process.env.MONGO_URI);

let db;

export const connectDB = async (dbname) => {
  if (!db) {
    await client.connect();
    db = client.db(dbname); 
    console.log("MongoDB connected");
  }
  return db;
};

export const getDB = () => db;
