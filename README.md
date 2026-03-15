# 📞 ZOSO IVR — Outbound Call System

A complete system to call your customers, collect any information via their phone keypad, and display it live on your dashboard.

---

## ✅ What This System Does

1. You open the dashboard in a browser
2. You type a customer's phone number and click **Call Now**
3. The system calls that customer immediately
4. The bot says your custom message and follows your script
5. The customer presses keys on their phone to respond
6. **Everything they type appears live on your dashboard**

---

## 🛠️ Setup — Step by Step

### Step 1 — Get a Twilio Account
1. Go to [twilio.com](https://twilio.com) and sign up (free trial available)
2. From your Twilio Console, copy:
   - **Account SID** (starts with AC...)
   - **Auth Token**
3. Buy a phone number inside Twilio (~$1/month)
4. Copy that phone number (e.g. +15551234567)

### Step 2 — Configure Your Keys
1. Rename `.env.example` to `.env`
2. Fill in your Twilio credentials:
```
TWILIO_ACCOUNT_SID=ACxxxxxxxxxxxxxx
TWILIO_AUTH_TOKEN=your_token_here
TWILIO_PHONE_NUMBER=+15551234567
BASE_URL=https://your-server-url.com
```

### Step 3 — Install & Run
```bash
npm install
npm start
```
Open your browser at: http://localhost:3000

### Step 4 — Make Your Server Public (for Twilio to reach it)
Twilio needs a public URL to send responses back to your server.

**Option A — For testing (free):**
```bash
npx ngrok http 3000
```
Copy the URL it gives you (e.g. `https://abc123.ngrok.io`)
Put it in your `.env` as `BASE_URL=https://abc123.ngrok.io`

**Option B — For production (free tier):**
Deploy to [render.com](https://render.com) or [railway.app](https://railway.app)
They give you a permanent public URL.

---

## ✏️ Editing Your Script

Open `config.js` — everything the bot says is there. No coding needed.

```js
// Change the greeting
greeting: {
  message: "Hello! This is a call from YOUR COMPANY...",
  ...
}

// Add, remove, or edit collection steps
steps: [
  {
    label: "Card Number",             // shown on dashboard
    message: "Please enter your 16-digit card number...",
    maxDigits: 16,
    timeout: 20,
    confirmMessage: "Thank you. ",
  },
  // Add more steps here...
]
```

**After editing config.js, restart the server** (`npm start`).

---

## 💰 Costs

| Service | Cost |
|---|---|
| Twilio phone number | ~$1/month |
| Outbound call (per minute) | ~$0.013/min |
| Inbound responses (DTMF) | Free (included in call) |
| Hosting on Render (basic) | Free |

**Example:** 100 calls, 2 min average = ~$2.60/month + $1 number = ~$3.60/month

---

## 📁 File Structure

```
ivr-system/
├── server.js        ← Main server (don't need to edit)
├── config.js        ← YOUR SCRIPT — edit this!
├── .env             ← Your Twilio keys (private)
├── package.json
└── public/
    └── index.html   ← Dashboard
```

---

## ❓ FAQ

**Can I collect more than 3 things?**
Yes — add more objects to the `steps` array in `config.js`. No limit.

**Can I collect letters, not just numbers?**
Phone keypads are numbers only (0-9, *, #). If you need letters, you'd need a different approach (voice AI).

**Can I add voice AI (that talks naturally)?**
Yes — that's System 2. We can build that next using Vapi.ai.

**Is this PCI compliant for card numbers?**
For PCI compliance, card data should go directly to Stripe via their own phone system. This system is for general data collection. For payments, we can integrate Stripe's terminal/phone flow.
