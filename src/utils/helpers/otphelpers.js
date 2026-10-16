import crypto from 'crypto';
import nodemailer from 'nodemailer';
import { getDB } from '../db/connection.js';

const OTP_EXPIRY_MS = 10 * 60 * 1000; // 10 minutes
const RESEND_COOLDOWN_MS = 60 * 1000; // 1 minute between requests
const MAX_ATTEMPTS = 5;

// ---------- Lazy getters (nothing touches DB or env at import time) ----------
let transporter;
function getTransporter() {
  if (!transporter) {
    transporter = nodemailer.createTransport({
      service: 'gmail',
      auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS, // Gmail App Password
      },
    });
  }
  return transporter;
}

// const email = process.env.EMAIL_PASS ;

// console.log(email,'email');


let indexCreated = false;
async function getOtpCollection() {
  const col = getDB().collection('otps');
  if (!indexCreated) {
    await col.createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 });
    indexCreated = true;
  }
  return col;
}

function getUserCollection() {
  return getDB().collection('users'); // change to your real users collection name
}

function hashOtp(email, otp) {
  return crypto
    .createHmac('sha256', process.env.OTP_SECRET)
    .update(`${email}:${otp}`)
    .digest('hex');
}

// ---------- 1. Generate OTP ----------
export async function getSendOtp(req, res) {
  try {
    const OtpCollection = await getOtpCollection();
    const UserCollection = getUserCollection();

    const email = (req.body.email || '').trim().toLowerCase();

    if (!/^\S+@\S+\.\S+$/.test(email)) {
      return res.status(400).json({ error: 'Valid email is required' });
    }

    const existingUser = await UserCollection.findOne({ email });
    if (existingUser) {
      return res.status(409).json({ message: 'User already exists' });
    }

    // Resend cooldown
    const existingOtp = await OtpCollection.findOne({ email });
    if (existingOtp && Date.now() - existingOtp.createdAt.getTime() < RESEND_COOLDOWN_MS) {
      return res
        .status(429)
        .json({ error: 'Please wait a minute before requesting another OTP' });
    }

    // Secure 6-digit code
    const otp = crypto.randomInt(100000, 1000000).toString();

    await OtpCollection.replaceOne(
      { email },
      {
        email,
        otpHash: hashOtp(email, otp),
        attempts: 0,
        createdAt: new Date(),
        expiresAt: new Date(Date.now() + OTP_EXPIRY_MS),
      },
      { upsert: true }
    );

    try {
      await getTransporter().sendMail({
        from: `"Shoperpoint.app" <${process.env.EMAIL_USER}>`,
        to: email,
        subject: 'Your verification code',
        text: `Your OTP for signup in ShoperPoint is ${otp}. It expires in 10 minutes. Don't share it with anyone.`,
      });
    } catch (mailErr) {
      console.error('Email send failed:', mailErr);
      await OtpCollection.deleteOne({ email });
      return res.status(500).json({ error: 'Could not send OTP email' });
    }

    res.status(200).json({ message: 'OTP sent to your email' , success:true});
  } catch (error) {
    console.error('generateOtp error:', error);
    res.status(500).json({ error: 'Something went wrong' });
  }
}

// ---------- 2. OTP verification helper ----------
export async function verifyOtp(email, otp) {
  const OtpCollection = await getOtpCollection();
  const record = await OtpCollection.findOne({ email });

  if (!record) return { ok: false, error: 'OTP not found or expired' };

  if (record.expiresAt < new Date()) {
    await OtpCollection.deleteOne({ email });
    return { ok: false, error: 'OTP expired' };
  }

  if (record.attempts >= MAX_ATTEMPTS) {
    await OtpCollection.deleteOne({ email });
    return { ok: false, error: 'Too many wrong attempts. Request a new OTP' };
  }

  const expected = Buffer.from(record.otpHash, 'hex');
  const received = Buffer.from(hashOtp(email, String(otp)), 'hex');

  if (!crypto.timingSafeEqual(expected, received)) {
    await OtpCollection.updateOne({ email }, { $inc: { attempts: 1 } });
    return { ok: false, error: 'Invalid OTP' };
  }

  // Valid: delete so it can't be reused
  await OtpCollection.deleteOne({ email });
  return { ok: true };
}