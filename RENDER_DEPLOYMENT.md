# Render Deployment Guide

## Quick Deploy

### Option 1: Blueprint (Recommended)
1. Push this repo to GitHub
2. Go to [Render Dashboard](https://dashboard.render.com)
3. Click "New" → "Blueprint"
4. Connect your GitHub repo
5. Render will auto-detect `render.yaml` and create all services

### Option 2: Manual Setup
1. Create a new "Web Service" on Render
2. Connect your GitHub repo
3. Configure:
   - **Build Command:** `npm install && npx prisma generate && npm run build`
   - **Start Command:** `npx prisma migrate deploy && node dist/src/main.js`
   - **Health Check Path:** `/health`

## Environment Variables

Set these in Render Dashboard → Environment:

| Variable | Required | Description |
|----------|----------|-------------|
| `DATABASE_URL` | Yes | PostgreSQL connection string (auto-set if using Render DB) |
| `JWT_SECRET` | Yes | Secret for JWT tokens (use "Generate" button) |
| `OPENAI_API_KEY` | Yes | OpenAI API key for AI features |
| `FIREBASE_PROJECT_ID` | Yes | Firebase project ID |
| `FIREBASE_CLIENT_EMAIL` | Yes | Firebase service account email |
| `FIREBASE_PRIVATE_KEY` | Yes | Firebase private key (include quotes) |
| `APP_BASE_URL` | Yes | Your Render URL (e.g., `https://jobmate-api.onrender.com`) |
| `S3_ACCESS_KEY` | If using uploads | AWS S3 access key |
| `S3_SECRET_KEY` | If using uploads | AWS S3 secret key |
| `S3_BUCKET` | If using uploads | S3 bucket name |
| `S3_REGION` | If using uploads | S3 region |
| `STRIPE_SECRET_KEY` | If using billing | Stripe secret key |
| `REDIS_URL` | Optional | Redis URL for queues |

## Notes

- Render uses port `10000` by default - the app auto-detects this via `PORT` env var
- Free tier services spin down after 15 min of inactivity (first request takes ~30s)
- Health checks hit `/health` endpoint
- Database migrations run automatically on deploy via `start:prod` script
