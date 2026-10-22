import { authMiddleware } from "../middlewares/Authmiddleware.js";
import { getDB } from "../utils/db/connection.js";
import express from "express";

const Cartrouter = express.Router();

Cartrouter.get("/", authMiddleware, async (req, res) => {
  try {
    const db = getDB();
    const userId = req.user.id;

    const cart = await db.collection("Cart").findOne({ userId });

    if (!cart || !cart.items?.length) {
      return res.json({ cart: { items: [] }, status: false, msg: "Your cart is empty" });
    }

    const products = await db.collection("Allproducts").find({}).toArray();

    // _id (ObjectId) -> product, so each item is matched instantly
    const productMap = new Map(products.map((p) => [String(p._id), p]));

    const items = cart.items
      .map((item) => {
        const product = productMap.get(String(item.productId));
        if (!product) return null; // product was deleted from the store
        return {
          ...product,                 // name, image, new_price, old_price, category...
          productId: item.productId,  // id stored in the cart
          quantity: item.quantity,    // quantity stored in the cart
        };
      })
      .filter(Boolean);

    res.json({ status: true, cart: { ...cart, items } });
  } catch (error) {
    console.error("get cart error:", error);
    res.status(500).json({ status: false, msg: "Could not load cart" });
  }
});

Cartrouter.post("/addtocart", authMiddleware, async (req, res) => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({ success: false, message: "User id is required" });
    }

    const productId = String(req.body.productId || "");
    const quantity = parseInt(req.body.quantity, 10) || 1;

    if (!productId || quantity < 1) {
      return res
        .status(400)
        .json({ success: false, message: "Valid productId and quantity are required" });
    }

    const db = getDB();
    const CartCollection = db.collection("Cart");

    // 1) product already in the cart? increase its quantity
    const inc = await CartCollection.updateOne(
      { userId, "items.productId": productId },
      {
        $inc: { "items.$.quantity": quantity },
        $set: { updatedAt: new Date() },
      },
    );

    // 2) otherwise add it (and create the cart if the user has none)
    if (inc.matchedCount === 0) {
      await CartCollection.updateOne(
        { userId },
        {
          $push: { items: { productId, quantity } },
          $set: { updatedAt: new Date() },
          $setOnInsert: { createdAt: new Date() },
        },
        { upsert: true },
      );
    }

    return res.json({ success: true, message: "Item added to cart" });
  } catch (error) {
    console.error("addtocart error:", error);
    return res.status(500).json({ success: false, message: "Could not add item to cart" });
  }
});



export default Cartrouter;
