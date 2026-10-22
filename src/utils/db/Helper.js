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

export const getPopular = async (req, res) => {
  try {
    const db = getDB();
    const category = req.body?.category;
    // console.log(category, 'category');

    const products = await db.collection("Allproducts").find({}).toArray();
    // console.log(products,'products');

    let result;
    if (category == "womens" || category == "mens") {
      result = products.filter((item) => item.popularin == category);
    } else {
      result = products.filter((item) => "popularin" in item);
    }

    return res.status(200).json(result);
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
};
