import express from "express";
import { getDB } from "../utils/db/connection.js";
import cloudinary from "../utils/db/CloudConnection.js";
import multer from "multer";
import { authorizeRoles } from "../middlewares/checkRoles.js";
import {  getPopular, getProducts } from "../utils/db/Helper.js";

const upload = multer({ storage: multer.memoryStorage() });
const Productrouter = express.Router();

Productrouter.get("/list", getProducts);

Productrouter.get("/popular", getPopular);

Productrouter.get("/:id", (req, res) => {
  res.send(`Product id: ${req.params.id}`);
});

Productrouter.post(
  "/addproduct",
  authorizeRoles("admin", "seller"),
  upload.single("imageFile"),
  async (req, res) => {
    try {
      const db = getDB();
      const { name, new_price, category, description } = req.body;

      let imageUrl = "";

      if (req.file) {
        const base64Image = `data:${req.file.mimetype};base64,${req.file.buffer.toString("base64")}`;
        const uploadResponse = await cloudinary.uploader.upload(base64Image, {
          folder: "products",
        });
        imageUrl = uploadResponse.secure_url;
      }

      await db.collection("Allproducts").insertOne({
        name,
        new_price,
        category,
        description,
        image: imageUrl,
      });

      res.status(201).send("Product Added Successfully!!");
    } catch (error) {
      console.error(error);
      res.status(500).send("Internal Server Error");
    }
  },
);

export default Productrouter;
