import { authMiddleware } from "../middlewares/Authmiddleware.js";
import { getDB } from "../utils/db/connection.js";
import express from "express";

const Cartrouter = express.Router();

Cartrouter.get("/", async (req, res) => {
  const db = getDB();
  const cart = await db.collection("Cart").findOne({ userId: req.user.id });

  if (!cart) {
    return res.json({ cart: [], status: false, msg: " Your cart is empty" });
  }

  res.json({ cart, status: true });
});

Cartrouter.post("/addtocart", authMiddleware, async (req, res) => {
  const { productId, quantity } = req.body;

  const userId = req.user.id;

  const db = getDB();
  const CartCollection = db.collection("Cart");

  if (!userId) {
    return res.json({ msg: "user id is required" });
  }

  const userCart = await CartCollection.findOne({ userId });

  if (!userCart) {
    await CartCollection.insertOne({
      userId,
      items: [{ productId, quantity }],
      createdAt: new Date(),
      updatedAt: new Date(),
    });
  } else {
    const itemExists = CartCollection.items.find(
      (item) => item.productId.tostring() === productId,
    );

    if (itemExists) {
      CartCollection.updateOne(
        { userId, "items.productId": productId },
        {
          $inc: { "items.$.quantity": quantity },
          $set: { updatedAt: new Date() },
        },
      );
    } else {
      await CartCollection.updateOne(
        {
          userId,
        },
        {
          $push: { items: { productId, quantity } },
          $set: { updatedAt: new Date() },
        },
      );
    }
  }
  res.json({ success: true, message: "Item added to cart" });
});



export default Cartrouter;
