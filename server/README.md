# Empresario Backend

Node.js/Express backend for OTP email verification and saving registrations to Google Sheets.

## Setup

1. Copy `.env.example` to `.env` and fill values.
2. Install deps and run:

```bash
cd server
npm install
npm run dev
```

## Environment

- PORT, CORS_ORIGINS
- OTP_* variables
- Email provider (SMTP or SendGrid)
- Google credentials:
  - Set `GOOGLE_CREDENTIALS_JSON_BASE64` to the base64 of your Service Account JSON
  - Or set `GOOGLE_APPLICATION_CREDENTIALS` to the path of the JSON file
- Google Sheets: `SPREADSHEET_ID`, `SHEET_NAME`

## Endpoints
- POST /api/otp/send { email }
- POST /api/otp/verify { email, otp }
- POST /api/register { ...form fields }