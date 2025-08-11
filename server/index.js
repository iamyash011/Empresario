import express from 'express';
import cors from 'cors';
import rateLimit from 'express-rate-limit';
import dotenv from 'dotenv';
import crypto from 'crypto';
import nodemailer from 'nodemailer';
import sgMail from '@sendgrid/mail';
import { google } from 'googleapis';

dotenv.config();

const app = express();

// CORS
const allowedOrigins = (process.env.CORS_ORIGINS || '').split(',').map(s => s.trim()).filter(Boolean);
app.use(cors({
  origin: (origin, callback) => {
    if (!origin || allowedOrigins.length === 0 || allowedOrigins.includes(origin)) {
      return callback(null, true);
    }
    return callback(new Error('Not allowed by CORS'));
  },
  credentials: true
}));

app.use(express.json({ limit: '1mb' }));

// Rate limiter (generic)
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 200
});
app.use(limiter);

// In-memory OTP store
const otpLength = parseInt(process.env.OTP_LENGTH || '6', 10);
const otpTtlSeconds = parseInt(process.env.OTP_TTL_SECONDS || '600', 10);
const rateWindowSeconds = parseInt(process.env.OTP_RATE_LIMIT_WINDOW_SECONDS || '900', 10);
const rateMaxPerWindow = parseInt(process.env.OTP_MAX_PER_WINDOW || '5', 10);
const minResendIntervalSeconds = parseInt(process.env.OTP_MIN_RESEND_INTERVAL_SECONDS || '60', 10);

/**
 * otpStore[email] = {
 *   code: string,
 *   expiresAt: number (epoch ms),
 *   lastSentAt: number (epoch ms),
 *   windowStartAt: number (epoch ms),
 *   sentCountInWindow: number
 * }
 */
const otpStore = new Map();

function generateOtp(length) {
  const digits = '0123456789';
  let otp = '';
  for (let i = 0; i < length; i++) {
    otp += digits[Math.floor(Math.random() * 10)];
  }
  return otp;
}

// Email sender setup
const emailProvider = process.env.EMAIL_PROVIDER || 'smtp';
let transporter = null;

if (emailProvider === 'sendgrid') {
  const apiKey = process.env.SENDGRID_API_KEY;
  if (!apiKey) {
    console.warn('SENDGRID_API_KEY not set. Email sending will fail.');
  } else {
    sgMail.setApiKey(apiKey);
  }
} else {
  // SMTP
  const host = process.env.SMTP_HOST;
  const port = parseInt(process.env.SMTP_PORT || '465', 10);
  const secure = String(process.env.SMTP_SECURE || 'true') === 'true';
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;
  if (!host || !user || !pass) {
    console.warn('SMTP credentials not set. Email sending will fail.');
  } else {
    transporter = nodemailer.createTransport({ host, port, secure, auth: { user, pass } });
  }
}

async function sendEmail({ to, subject, text, html }) {
  const from = process.env.EMAIL_FROM || 'no-reply@example.com';
  if (emailProvider === 'sendgrid') {
    return sgMail.send({ to, from, subject, text, html });
  }
  if (!transporter) {
    throw new Error('Email transporter not configured');
  }
  return transporter.sendMail({ to, from, subject, text, html });
}

// Google Sheets setup
let sheetsClient = null;
async function getSheetsClient() {
  if (sheetsClient) return sheetsClient;

  const base64 = process.env.GOOGLE_CREDENTIALS_JSON_BASE64;
  let credentials = null;
  if (base64) {
    const json = Buffer.from(base64, 'base64').toString('utf8');
    credentials = JSON.parse(json);
  }
  // If not base64, will rely on GOOGLE_APPLICATION_CREDENTIALS env pointing to a file
  const auth = new google.auth.GoogleAuth({
    credentials: credentials || undefined,
    scopes: ['https://www.googleapis.com/auth/spreadsheets']
  });
  const authClient = await auth.getClient();
  sheetsClient = google.sheets({ version: 'v4', auth: authClient });
  return sheetsClient;
}

// Healthcheck
app.get('/api/health', (req, res) => {
  res.json({ ok: true, time: new Date().toISOString() });
});

// Send OTP
app.post('/api/otp/send', async (req, res) => {
  try {
    const { email } = req.body || {};
    if (!email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
      return res.status(400).json({ error: 'Invalid email' });
    }

    const now = Date.now();
    const entry = otpStore.get(email) || {
      code: null,
      expiresAt: 0,
      lastSentAt: 0,
      windowStartAt: now,
      sentCountInWindow: 0
    };

    // Reset window if elapsed
    if (now - entry.windowStartAt > rateWindowSeconds * 1000) {
      entry.windowStartAt = now;
      entry.sentCountInWindow = 0;
    }

    if (entry.sentCountInWindow >= rateMaxPerWindow) {
      return res.status(429).json({ error: 'Too many OTP requests. Try later.' });
    }

    if (now - entry.lastSentAt < minResendIntervalSeconds * 1000) {
      return res.status(429).json({ error: 'Please wait before requesting another OTP.' });
    }

    const code = generateOtp(otpLength);
    entry.code = code;
    entry.expiresAt = now + otpTtlSeconds * 1000;
    entry.lastSentAt = now;
    entry.sentCountInWindow += 1;
    otpStore.set(email, entry);

    const subject = 'Your Empresario verification code';
    const text = `Your verification code is ${code}. It expires in ${Math.floor(otpTtlSeconds / 60)} minutes.`;
    const html = `<p>Your verification code is <b>${code}</b>.</p><p>It expires in ${Math.floor(otpTtlSeconds / 60)} minutes.</p>`;

    await sendEmail({ to: email, subject, text, html });
    res.json({ ok: true });
  } catch (err) {
    console.error('Error sending OTP', err);
    res.status(500).json({ error: 'Failed to send OTP' });
  }
});

// Verify OTP
app.post('/api/otp/verify', (req, res) => {
  const { email, otp } = req.body || {};
  if (!email || !otp) {
    return res.status(400).json({ error: 'email and otp required' });
  }
  const entry = otpStore.get(email);
  if (!entry || !entry.code) {
    return res.status(400).json({ error: 'OTP not found. Request a new one.' });
  }
  const now = Date.now();
  if (now > entry.expiresAt) {
    return res.status(400).json({ error: 'OTP expired. Request a new one.' });
  }
  if (String(otp) !== String(entry.code)) {
    return res.status(400).json({ error: 'Invalid OTP' });
  }
  // Mark as verified for this window by clearing code
  entry.code = null;
  otpStore.set(email, entry);
  res.json({ ok: true });
});

// Save registration
app.post('/api/register', async (req, res) => {
  try {
    const spreadsheetId = process.env.SPREADSHEET_ID;
    const sheetName = process.env.SHEET_NAME || 'Submissions';
    if (!spreadsheetId) {
      return res.status(500).json({ error: 'SPREADSHEET_ID not configured' });
    }

    const body = req.body || {};
    // Minimal validation: require email and a few key fields
    if (!body.email) {
      return res.status(400).json({ error: 'email required' });
    }

    const sheets = await getSheetsClient();

    const timestamp = new Date().toISOString();

    // Flatten body to a consistent order (we will store JSON too)
    const row = [
      timestamp,
      body.email || '',
      body.fullName || '',
      body.secondaryEmail || '',
      body.phone || '',
      body.organization || '',
      body.city || '',
      body.startupName || '',
      body.website || '',
      body.industry || '',
      body.socialImpact || '',
      body.iitkgpAffiliation || '',
      body.aiMlCore || '',
      body.tis || '',
      body.problem || '',
      body.solution || '',
      body.market || '',
      body.traction || '',
      body.revenue || '',
      body.extra || '',
      JSON.stringify(body)
    ];

    await sheets.spreadsheets.values.append({
      spreadsheetId,
      range: `${sheetName}!A:Z`,
      valueInputOption: 'USER_ENTERED',
      requestBody: { values: [row] }
    });

    res.json({ ok: true });
  } catch (err) {
    console.error('Error saving registration', err);
    res.status(500).json({ error: 'Failed to save registration' });
  }
});

const port = parseInt(process.env.PORT || '8080', 10);
app.listen(port, () => {
  console.log(`Server listening on port ${port}`);
});