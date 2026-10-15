import express from "express";
import { MongoClient } from "mongodb";
import Cors from "cors";
import jwt from "jsonwebtoken";
import dotenv from "dotenv";
import cookieParser from "cookie-parser";
import { connectDB } from "./src/utils/db/connection.js";
import { authMiddleware } from "./src/middlewares/Authmiddleware.js";
import Productrouter from "./src/Routes/ProductsRoute.js";
import Cartrouter from "./src/Routes/CartRoutes.js";
import { getLatestCollections } from "./src/utils/db/Helper.js";

dotenv.config();
const app = express();
const port = 3000;
app.use(
  Cors({
    origin: "http://localhost:5174",
    methods: ["GET", "POST", "PUT", "DELETE"],
    allowedHeaders: ["Content-Type", "Authorization"],
  }),
);
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());

const dbName = "ShopperPoint";
const client = new MongoClient(process.env.MONGO_URI);
client.connect().then(() => {
  console.log("Connected successfully to the database");
});
const db = await connectDB(dbName);
const UserCollection = db.collection("users");

app.use("/log/cart", authMiddleware, Cartrouter);
app.use("/log/products", authMiddleware, Productrouter);

app.get("/", async (req, res) => {
  res.send("Server is ready to Go!");
});

app.get("/userlist", async (req, res) => {
  const data = await UserCollection.find({}).toArray();
  res.send(data);
});

app.post("/register", async (req, res) => {
  const data = req.body;
  if(!data.name || !data.password) return res.json({ error: "username or password missing!" });
  
  const user = await UserCollection.findOne(data);

  if (user) {
    return res.status(404).json({ message: "User Alrady Exists" });
  }

  UserCollection.insertOne(data)
    .then(() => {
      res.status(200).json({ message: "Data inserted successfully" });
    })
    .catch((error) => {
      console.error("Error inserting data:", error);
      res
        .status(500)
        .json({ error: "An error occurred during data insertion" });
    });
});

app.post("/signin", async (req, res) => {
  const data = req.body;

  const old = await UserCollection.find()?.toArray();
  // console.log(data, "old");
 console.log(old,'user');
  const user = old.find(
    (user) => user.name === data.username && user.password === data.password,
  );
 
  

  if (user) {
    const code = process.env.SECRET_KEY;
    // const token = jwt.sign({ data, }, code, { expiresIn: '3d' })
    const token = jwt.sign({ id: user._id, username: user.username }, code, {
      expiresIn: "7d",
    });
    res.cookie("token", token, {
      httpOnly: true,
      secure: true,
      sameSite: "lax",
      maxAge: 3 * 24 * 60 * 60 * 1000,
    });

    res.cookie("username", user.name, {
      httpOnly: false,
      secure: true,
      sameSite: "lax",
      maxAge: 3 * 24 * 60 * 60 * 1000,
    });

    res.status(200).json({
      success: true,
      message: "Login successful",
      data: {
        username: user.name,
        token,
      },
    });
  } else {
      res.send({ message: "Invalid credentials or User!" });
  }
});

app.post("/logout", (req, res) => {
  res.clearCookie("token", {
    httpOnly: true,
    secure: false,
    sameSite: "none",
  });
  res.send({ message: "Logged out successfully!" });
});

app.get("/latestCollection",getLatestCollections);

app.listen(port, () => {
  console.log(`Server is running on http://localhost:${port}`);
});
