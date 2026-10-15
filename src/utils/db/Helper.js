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


export async function getLatestCollections(req, res) {
  try {
    const db = getDB();
    // console.log(db.collection(),'data base');
    
    const products = await db.collection("LatestCollections").find({}).toArray();
    return res.json({ data: products, status: true });
  } catch (error) {
    return res.status(500).json({ error: error.message }); // also fixed: was `err`, should be `error`
  }
}

