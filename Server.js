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
import { getSendOtp, verifyOtp } from "./src/utils/helpers/otphelpers.js";
import bcrypt from 'bcrypt'

dotenv.config();
const app = express();
const port = 3000;
app.use(
  Cors({
    origin: ["http://localhost:5174","https://ashoperpoint.vercel.app","https://ashoperpoint.vercel.app/","http://localhost:5173"],
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

// app.post("/register", async (req, res) => {
//   const data = req.body;
//   if(!data.name || !data.password) return res.json({ error: "username or password missing!" });
  
//   const user = await UserCollection.findOne(data);

//   if (user) {
//     return res.status(404).json({ message: "User Alrady Exists" });
//   }

//   UserCollection.insertOne(data)
//     .then(() => {
//       res.status(200).json({ message: "Data inserted successfully" });
//     })
//     .catch((error) => {
//       console.error("Error inserting data:", error);
//       res
//         .status(500)
//         .json({ error: "An error occurred during data insertion" });
//     });
// });

// / ---------- 3. Register (OTP verified first) ----------
app.post("/generateOtp", getSendOtp)
app.post("/register", async (req, res) => {
  try {
    const { name, password, otp } = req.body;
    const email = (req.body.email || "").trim().toLowerCase();
 
    if (!name || !password || !email || !otp) {
      return res
        .status(400)
        .json({ error: "name, email, password and otp are required" });
    }
 
    const user = await UserCollection.findOne({ email });
    if (user) {
      return res.status(409).json({ message: "User already exists" });
    }
 
    // Verify OTP before doing anything else
    const result = await verifyOtp(email, otp);
    if (!result.ok) {
      return res.status(400).json({ error: result.error });
    }
 
    const hashedPassword = await bcrypt.hash(password, 10);
 
    await UserCollection.insertOne({
      name,
      email,
      password: hashedPassword,
      createdAt: new Date(),
    });
 
    res.status(200).json({ message: "Data inserted successfully", success:true });
  } catch (error) {
    console.error("Error inserting data:", error);
    res.status(500).json({ error: "An error occurred during data insertion" });
  }
});

// app.post("/signin", async (req, res) => {
//   const data = req.body;

//   const old = await UserCollection.find()?.toArray();
//   // console.log(data, "old");
//  console.log(old,'user');
//   const user = old.find(
//     (user) => user.name === data.username && user.password === data.password,
//   );
 
  

//   if (user) {
//     const code = process.env.SECRET_KEY;
//     // const token = jwt.sign({ data, }, code, { expiresIn: '3d' })
//     const token = jwt.sign({ id: user._id, username: user.username }, code, {
//       expiresIn: "7d",
//     });
//     res.cookie("token", token, {
//       httpOnly: true,
//       secure: true,
//       sameSite: "lax",
//       maxAge: 3 * 24 * 60 * 60 * 1000,
//     });

//     res.cookie("username", user.name, {
//       httpOnly: false,
//       secure: true,
//       sameSite: "lax",
//       maxAge: 3 * 24 * 60 * 60 * 1000,
//     });

//     res.status(200).json({
//       success: true,
//       message: "Login successful",
//       data: {
//         username: user.name,
//         token,
//       },
//     });
//   } else {
//       res.send({ message: "Invalid credentials or User!" });
//   }
// });

app.post("/signin", async (req, res) => {
  try {
    const { username, password } = req.body;

    if (!username || !password) {
      return res
        .status(400)
        .json({ success: false, message: "Username and password are required" });
    }

    const user = await UserCollection.findOne({ name: username });

    if (!user) {
      return res
        .status(401)
        .json({ success: false, message: "Invalid credentials!" });
    }

    const isMatch = await bcrypt.compare(password, user.password);

    if (!isMatch) {
      return res
        .status(401)
        .json({ success: false, message: "Invalid credentials!" });
    }

    const token = jwt.sign(
      { id: user._id, username: user.name },
      process.env.SECRET_KEY,
      { expiresIn: "3d" }
    );

    res.status(200).json({
      success: true,
      message: "Login successful",
      data: {
        username: user.name,
        token,
      },
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: "Server error" });
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
