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

Cartrouter.delete("/deleteProduct", authMiddleware, async (req, res) => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({ success: false, message: "User id is required" });
    }

    const productId = String(req.body.productId || "");
    const removeAll = req.body.removeAll === true;
    const decreaseBy = Number(req.body.quantity ?? 1);

    if (!productId || (!removeAll && (!Number.isInteger(decreaseBy) || decreaseBy < 1))) {
      return res
        .status(400)
        .json({ success: false, message: "Valid productId is required" });
    }

    const CartCollection = getDB().collection("Cart");

    const removeItem = () =>
      CartCollection.updateOne(
        { userId, "items.productId": productId },
        { $pull: { items: { productId } }, $set: { updatedAt: new Date() } },
      );

    // remove the product completely
    if (removeAll) {
      const result = await removeItem();
      if (result.matchedCount === 0) {
        return res.status(404).json({ success: false, message: "Item not found in cart" });
      }
      return res.json({ success: true, message: "Item removed from cart" });
    }

    // decrease quantity (only if it stays above 0)
    const dec = await CartCollection.updateOne(
      { userId, items: { $elemMatch: { productId, quantity: { $gt: decreaseBy } } } },
      {
        $inc: { "items.$.quantity": -decreaseBy },
        $set: { updatedAt: new Date() },
      },
    );

    if (dec.matchedCount === 1) {
      return res.json({ success: true, message: "Quantity decreased" });
    }

    // quantity would reach 0 or below, so remove the item
    const result = await removeItem();
    if (result.matchedCount === 0) {
      return res.status(404).json({ success: false, message: "Item not found in cart" });
    }
    return res.json({ success: true, message: "Item removed from cart" });
  } catch (error) {
    console.error("delete item error:", error);
    return res
      .status(500)
      .json({ success: false, message: "Could not update cart" });
  }
});

Cartrouter.post("/getConfirmedOrder", async (req, res) => {
    try {
        const db = getDB();
        const userId = req.user.id;
        // const { razorpay_order_id, razorpay_payment_id, razorpay_signature } = req.body;

        // if (!razorpay_order_id || !razorpay_payment_id || !razorpay_signature) {
        //     return res.status(400).json({ status: false, msg: "Missing payment details" });
        // }

        const orders = await db
            .collection("Orders")
            .findOne({});

            console.log('orders',orders);
            

        // if (!order) {
        //     return res.status(404).json({ status: false, msg: "Order not found" });
        // }
        // if (order.status === "paid") {
        //     return res.json({ status: true, msg: "Already paid", orderId: order._id });
        // }

        if(!!orders){
          return res.json({status:200, message:'fetched successfully!',data:orders})
        }

        // const expected = crypto
        //     .createHmac("sha256", process.env.RAZORPAY_KEY_SECRET)
        //     .update(`${razorpay_order_id}|${razorpay_payment_id}`)
        //     .digest("hex");

        // const a = Buffer.from(expected);
        // const b = Buffer.from(String(razorpay_signature));
        // const valid = a.length === b.length && crypto.timingSafeEqual(a, b);

        // if (!valid) {
        //     await db
        //         .collection("Orders")
        //         .updateOne({ _id: order._id }, { $set: { status: "failed" } });
        //     return res.status(400).json({ status: false, msg: "Payment verification failed" });
        // }

        // await db.collection("Orders").updateOne(
        //     { _id: order._id },
        //     {
        //         $set: {
        //             status: "paid",
        //             razorpayPaymentId: razorpay_payment_id,
        //             paidAt: new Date(),
        //         },
        //     }
        // );
        // await db.collection("Cart").deleteOne({ userId }); // clear cart

        // res.json({ status: true, msg: "Payment successful", orderId: order._id });
    } catch (err) {
        console.error("verify error:", err);
        res.status(500).json({ status: false, msg: "Verification error" });
    }
});



export default Cartrouter;
