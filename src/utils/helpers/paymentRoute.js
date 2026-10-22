import express from "express";
import crypto from "crypto";
import Razorpay from "razorpay";
import { ObjectId } from "mongodb";
import { calculateTotals } from "./pricing.js";
import { getDB } from "../db/connection.js";

const razorpay = new Razorpay({
    key_id: process.env.RAZORPAY_KEY_ID,
    key_secret: process.env.RAZORPAY_KEY_SECRET,
});

const toObjectId = (id) => {
    try {
        return new ObjectId(id);
    } catch {
        return id; 
    }
};

/* ------------------------------------------------------------------ */
/* Validate + clean the delivery address (never trust the frontend)     */
/* Returns { address } on success or { error } on failure.              */
/* ------------------------------------------------------------------ */
function validateAddress(input) {
    if (!input || typeof input !== "object") {
        return { error: "Delivery address is required" };
    }

    const clean = (v) => (typeof v === "string" ? v.trim() : "");

    const address = {
        fullName: clean(input.fullName),
        phone: clean(input.phone),
        addressLine1: clean(input.addressLine1),
        addressLine2: clean(input.addressLine2),
        landmark: clean(input.landmark),
        pincode: clean(input.pincode),
        city: clean(input.city),
        state: clean(input.state),
        country: "India",
    };

    if (address.fullName.length < 3) return { error: "Enter a valid full name" };
    if (!/^[6-9]\d{9}$/.test(address.phone)) return { error: "Enter a valid 10-digit mobile number" };
    if (address.addressLine1.length < 5) return { error: "Enter a valid address" };
    if (!/^[1-9]\d{5}$/.test(address.pincode)) return { error: "Enter a valid 6-digit pincode" };
    if (!address.city) return { error: "City is required" };
    if (!address.state) return { error: "State is required" };

    return { address };
}

/* ------------------------------------------------------------------ */
/* Build trusted cart lines: quantity from Cart, price from Products   */
/* ASSUMED SHAPES (change if yours differ):                            */
/*   Cart:     { userId, items: [{ productId, quantity }] }            */
/*   Products: { _id, name, new_price }                                */
/* ------------------------------------------------------------------ */
async function getTrustedLines(db, userId) {
    const cart = await db.collection("Cart").findOne({ userId });
    const cartItems = cart?.items || [];
    if (!cartItems.length) return [];

    const ids = cartItems.map((i) => toObjectId(i.productId));
    const products = await db
        .collection("Products")
        .find({ _id: { $in: ids } })
        .toArray();

    const byId = new Map(products.map((p) => [String(p._id), p]));

    return cartItems
        .map((i) => {
            const p = byId.get(String(i.productId));
            if (!p) return null; // product deleted
            return {
                productId: String(p._id),
                name: p.name,
                price: Number(p.new_price),
                quantity: Math.max(1, parseInt(i.quantity, 10) || 1),
            };
        })
        .filter(Boolean);
}

/* ------------------------------------------------------------------ */
/* Protected routes (mount AFTER your auth middleware)                  */
/* ------------------------------------------------------------------ */
const paymentRouter = express.Router();

// 1) Create order
paymentRouter.post("/create-order", async (req, res) => {
    try {
        const db = getDB();
        const userId = req.user.id;

        const { address, error: addressError } = validateAddress(req.body?.address);
        if (addressError) {
            return res.status(400).json({ status: false, msg: addressError });
        }

        const lines = await getTrustedLines(db, userId);
        if (!lines.length) {
            return res.status(400).json({ status: false, msg: "Your cart is empty" });
        }

        const totals = calculateTotals(lines);

        // our own order record first
        const orderDoc = {
            userId,
            shippingAddress: address,
            items: totals.lines,
            pricing: {
                subtotal: totals.subtotal,
                gstTotal: totals.gstTotal,
                delivery: totals.delivery,
                platformFee: totals.platformFee,
                grandTotal: totals.grandTotal,
            },
            status: "pending",
            createdAt: new Date(),
        };
        const { insertedId } = await db.collection("Orders").insertOne(orderDoc);

        // gateway order
        const rzpOrder = await razorpay.orders.create({
            amount: totals.amountInPaise,
            currency: "INR",
            receipt: String(insertedId),
            notes: { orderId: String(insertedId), userId: String(userId) },
        });

        await db
            .collection("Orders")
            .updateOne({ _id: insertedId }, { $set: { razorpayOrderId: rzpOrder.id } });

        res.json({
            status: true,
            orderId: insertedId,
            razorpayOrderId: rzpOrder.id,
            amount: rzpOrder.amount,
            currency: rzpOrder.currency,
            keyId: process.env.RAZORPAY_KEY_ID, // public key, safe to send
            pricing: orderDoc.pricing,
        });
    } catch (err) {
        console.error("create-order error:", err);
        res.status(500).json({ status: false, msg: "Could not start payment" });
    }
});

// 2) Verify payment (called by the frontend after the popup succeeds)
paymentRouter.post("/verify", async (req, res) => {
    try {
        const db = getDB();
        const userId = req.user.id;
        const { razorpay_order_id, razorpay_payment_id, razorpay_signature } = req.body;

        if (!razorpay_order_id || !razorpay_payment_id || !razorpay_signature) {
            return res.status(400).json({ status: false, msg: "Missing payment details" });
        }

        const order = await db
            .collection("Orders")
            .findOne({ razorpayOrderId: razorpay_order_id, userId });

        if (!order) {
            return res.status(404).json({ status: false, msg: "Order not found" });
        }
        if (order.status === "paid") {
            return res.json({ status: true, msg: "Already paid", orderId: order._id });
        }

        const expected = crypto
            .createHmac("sha256", process.env.RAZORPAY_KEY_SECRET)
            .update(`${razorpay_order_id}|${razorpay_payment_id}`)
            .digest("hex");

        const a = Buffer.from(expected);
        const b = Buffer.from(String(razorpay_signature));
        const valid = a.length === b.length && crypto.timingSafeEqual(a, b);

        if (!valid) {
            await db
                .collection("Orders")
                .updateOne({ _id: order._id }, { $set: { status: "failed" } });
            return res.status(400).json({ status: false, msg: "Payment verification failed" });
        }

        await db.collection("Orders").updateOne(
            { _id: order._id },
            {
                $set: {
                    status: "paid",
                    razorpayPaymentId: razorpay_payment_id,
                    paidAt: new Date(),
                },
            }
        );
        await db.collection("Cart").deleteOne({ userId }); // clear cart

        res.json({ status: true, msg: "Payment successful", orderId: order._id });
    } catch (err) {
        console.error("verify error:", err);
        res.status(500).json({ status: false, msg: "Verification error" });
    }
});

/* ------------------------------------------------------------------ */
/* Webhook (backup if the user closes the tab before /verify runs)      */
/* Needs the RAW body, so mount it BEFORE express.json() - see notes.   */
/* ------------------------------------------------------------------ */
const webhookRouter = express.Router();

webhookRouter.post(
    "/razorpay-webhook",
    express.raw({ type: "application/json" }),
    async (req, res) => {
        try {
            const signature = req.headers["x-razorpay-signature"];
            const expected = crypto
                .createHmac("sha256", process.env.RAZORPAY_WEBHOOK_SECRET)
                .update(req.body) // Buffer
                .digest("hex");

            if (!signature || signature !== expected) {
                return res.status(400).send("Invalid signature");
            }

            const event = JSON.parse(req.body.toString());

            if (event.event === "payment.captured") {
                const payment = event.payload.payment.entity;
                const db = getDB();

                const order = await db
                    .collection("Orders")
                    .findOne({ razorpayOrderId: payment.order_id });

                if (order && order.status !== "paid") {
                    await db.collection("Orders").updateOne(
                        { _id: order._id },
                        {
                            $set: {
                                status: "paid",
                                razorpayPaymentId: payment.id,
                                paidAt: new Date(),
                            },
                        }
                    );
                    await db.collection("Cart").deleteOne({ userId: order.userId });
                }
            }

            res.status(200).send("ok");
        } catch (err) {
            console.error("webhook error:", err);
            res.status(500).send("error");
        }
    }
);

export { paymentRouter, webhookRouter };