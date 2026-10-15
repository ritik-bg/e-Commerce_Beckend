import { getDB } from "./connection.js";

export async function getProducts(req, res) {
  try {
    const db = getDB();
    const products = await db.collection("Allproducts").find({}).toArray();
    return res.json({ data: products, status: true });
  } catch (error) {
    return res.status(500).json({ error: error.message }); // also fixed: was `err`, should be `error`
  }
}