/**
 * curfew. - Secure Production Backend Engine
 */
require('dotenv').config();
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const mongoose = require('mongoose');

const app = express();
app.use(cors());
app.use(express.json({ limit: '15mb' }));
app.use(express.urlencoded({ limit: '15mb', extended: true }));

const server = http.createServer(app);
const io = new Server(server, {
    cors: { origin: "*" },
    maxHttpBufferSize: 1e7 
});

const PORT = process.env.PORT || 8080;

const OPEN_HOUR = 19;  
const CLOSE_HOUR = 4;  
const IS_DEV_MODE = true; 

function checkCurfewStatus() {
    if (IS_DEV_MODE) return true;
    const currentHour = new Date().getHours();
    if (OPEN_HOUR > CLOSE_HOUR) {
        return (currentHour >= OPEN_HOUR || currentHour < CLOSE_HOUR);
    }
    return (currentHour >= OPEN_HOUR && currentHour < CLOSE_HOUR);
}

// --- DATABASE CONNECTIVITY ---
mongoose.connect(process.env.MONGODB_URI, { dbName: 'Curfew' })
    .then(() => console.log('Successfully established secure connection to MongoDB Atlas [Target: Curfew].'))
    .catch(err => console.error('CRITICAL DATABASE ERROR:', err.message));

// --- MONGOOSE SCHEMAS ---
const RoomSchema = new mongoose.Schema({
    roomCode: { type: String, required: true, unique: true, index: true },
    roomName: { type: String, required: true },
    isDM: { type: Boolean, default: false },
    participants: [{ type: String }], 
    createdAt: { type: Date, default: Date.now }
});
const Room = mongoose.model('Room', RoomSchema);

const MessageSchema = new mongoose.Schema({
    roomCode: { type: String, required: true, index: true },
    sender: { type: String, required: true },
    senderSig: { type: String, required: true }, 
    text: { type: String, required: true },
    type: { type: String, default: 'text' },
    timestamp: { type: Date, default: Date.now }
});
const Message = mongoose.model('Message', MessageSchema);

const IdentitySchema = new mongoose.Schema({
    fingerprintId: { type: String, required: true, unique: true, index: true },
    alias: { type: String, required: true },
    oneLiner: { type: String, required: true },
    description: { type: String, default: "" },
    powers: { type: String, default: "" },
    assignedAt: { type: Date, default: Date.now }
});
const Identity = mongoose.model('Identity', IdentitySchema);

const ReportSchema = new mongoose.Schema({
    roomCode: { type: String, required: true, index: true },
    targetSig: { type: String, required: true, index: true },
    reporterSig: { type: String, required: true },
    timestamp: { type: Date, default: Date.now }
});
ReportSchema.index({ roomCode: 1, targetSig: 1, reporterSig: 1 }, { unique: true });
const Report = mongoose.model('Report', ReportSchema);

const BanListSchema = new mongoose.Schema({
    roomCode: { type: String, required: true, index: true },
    fingerprintId: { type: String, required: true, index: true },
    bannedAt: { type: Date, default: Date.now }
});
const BanList = mongoose.model('BanList', BanListSchema);

const FeedbackSchema = new mongoose.Schema({
    senderAlias: { type: String, default: "Anonymous" },
    text: { type: String, required: true },
    timestamp: { type: Date, default: Date.now }
});
const Feedback = mongoose.model('Feedback', FeedbackSchema);

// --- SECURE DYNAMIC ROOM CREATION ENGINE ---
app.post('/api/create-room', async (req, res) => {
    if (!checkCurfewStatus()) return res.status(403).json({ error: "Curfew is active." });
    const { roomName } = req.body;
    if (!roomName || roomName.trim() === "") return res.status(400).json({ error: "Name field required." });
    try {
        let uniqueCode = "";
        let collisionCheck = true;
        let attempts = 0;
        while (collisionCheck && attempts < 15) {
            attempts++;
            uniqueCode = String(Math.floor(100000 + Math.random() * 900000));
            const existingRoom = await Room.findOne({ roomCode: uniqueCode });
            if (!existingRoom) collisionCheck = false;
        }
        if (collisionCheck) throw new Error("Server channel lane allocation failure.");
        const newRoom = new Room({ roomCode: uniqueCode, roomName: roomName.trim() });
        await newRoom.save();
        res.status(201).json({ roomCode: uniqueCode, roomName: newRoom.roomName });
    } catch (error) {
        res.status(500).json({ error: "Internal processing error." });
    }
});

// --- 2. EXISTING DIRECT CHANNEL ROUTING INDEX VERIFIER ---
app.get('/api/check-existing-dm', async (req, res) => {
    const { sigA, sigB } = req.query;
    if (!sigA || !sigB) return res.status(400).json({ error: "Participants flags missing." });
    try {
        const lane = await Room.findOne({
            isDM: true,
            participants: { $all: [sigA, sigB] }
        });
        if (lane) {
            return res.json({ exists: true, roomCode: lane.roomCode, roomName: lane.roomName });
        }
        res.json({ exists: false });
    } catch(err) {
        res.status(500).json({ error: "Internal database query error." });
    }
});

// --- STRICT ROOM JOINING CHECK VALIDATOR ---
app.get('/api/verify-room/:code', async (req, res) => {
    if (!checkCurfewStatus()) {
        return res.json({ allowed: false, curfewActive: true, error: "Curfew is active." });
    }
    const clientSig = req.query.sig;
    try {
        const activeRoom = await Room.findOne({ roomCode: req.params.code.trim() });
        if (!activeRoom) {
            return res.json({ allowed: false, error: "Invalid Code !!" });
        }
        
        if (clientSig) {
            const isBanned = await BanList.findOne({ roomCode: activeRoom.roomCode, fingerprintId: clientSig });
            if (isBanned) {
                return res.json({ allowed: false, isBanned: true, error: "You are banned from this group for today." });
            }
        }
        res.json({ allowed: true, valid: true, roomCode: activeRoom.roomCode, roomName: activeRoom.roomName });
    } catch (error) {
        res.json({ allowed: false, error: "Database verification exception." });
    }
});

app.get('/api/rooms/:code/messages', async (req, res) => {
    if (!checkCurfewStatus()) return res.status(403).json({ error: "Curfew active." });
    try {
        const logs = await Message.find({ roomCode: req.params.code }).sort({ timestamp: 1 });
        res.json(logs);
    } catch (error) {
        res.status(500).json({ error: "Failed to compile messages." });
    }
});

// --- SECURE IDENTITY DISPATCHER ---
app.post('/api/get-identity', async (req, res) => {
    if (!checkCurfewStatus()) return res.status(403).json({ error: "Curfew active." });
    const { fingerprintId } = req.body;
    if (!fingerprintId) return res.status(400).json({ error: "Signature token required." });
    try {
        const existingIdentity = await Identity.findOne({ fingerprintId });
        if (existingIdentity) return res.json({ name: existingIdentity.alias, isNew: false });

        const claimedIdentities = await Identity.find().distinct('alias');
        const exclusionString = claimedIdentities.length > 0 ? `Do not select any names from this list: [${claimedIdentities.join(', ')}].` : '';
        const todayStr = new Date().toDateString();
        const prompt = `Generate ONE random famous character's identity. 
        Respond ONLY with a clean JSON structure matching this format exactly:
        {
          "name": "Character Name",
          "powers": "Brief list of primary abilities",
          "description": "One sentence summary of who they are and what they do"
        }
        Today's seed modifier: ${todayStr}. ${exclusionString}`;

        const apiKey = process.env.GEMINI_API_KEY;
        const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`;
        const response = await fetch(url, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] })
        });
        if (!response.ok) throw new Error(`API error code ${response.status}`);
        const data = await response.json();
        let rawText = data.candidates[0].content.parts[0].text.trim();
        if (rawText.startsWith("```json")) rawText = rawText.substring(7, rawText.length - 3);
        if (rawText.startsWith("```")) rawText = rawText.substring(3, rawText.length - 3);
        const identityData = JSON.parse(rawText.trim());

        const newIdentity = new Identity({ 
            fingerprintId, 
            alias: identityData.name, 
            oneLiner: "active",
            description: identityData.description,
            powers: identityData.powers
        });
        await newIdentity.save();
        res.json({ name: newIdentity.alias, powers: newIdentity.powers, description: newIdentity.description, isNew: true });
    } catch (error) {
        res.json({ name: "Batman", powers: "Intellect, martial arts, gadgets", description: "Gotham's Dark Knight protector.", isNew: true });
    }
});

// --- PRIVATE DM AND APP REVIEWS PIPELINES ---
app.post('/api/create-dm', async (req, res) => {
    const { targetSig, roomName, creatorSig } = req.body;
    try {
        let existingDM = await Room.findOne({ isDM: true, participants: { $all: [creatorSig, targetSig] } });
        if (existingDM) { return res.json({ roomCode: existingDM.roomCode, roomName: existingDM.roomName }); }
        const uniqueCode = "dm_" + String(Math.floor(100000 + Math.random() * 900000));
        const newDM = new Room({ roomCode: uniqueCode, roomName: roomName.trim(), isDM: true, participants: [creatorSig, targetSig] });
        await newDM.save();
        res.status(201).json({ roomCode: uniqueCode, roomName: newDM.roomName });
    } catch (err) {
        res.status(500).json({ error: "Failed to initialize custom DM lane matrix." });
    }
});

app.post('/api/feedback', async (req, res) => {
    const { text, alias } = req.body;
    try {
        const entry = new Feedback({ senderAlias: alias, text });
        await entry.save();
        res.json({ success: true, message: "Feedback stored successfully." });
    } catch (err) {
        res.status(500).json({ error: "Feedback storage crash." });
    }
});

// --- DEMOCRATIC MODERATION EVALUATION PIPELINE ---
app.post('/api/report-user', async (req, res) => {
    const { roomCode, targetSig, reporterSig } = req.body;
    if (!roomCode || !targetSig || !reporterSig) return res.status(400).json({ error: "Missing required arguments parameters." });
    try {
        const existingReport = await Report.findOne({ roomCode, targetSig, reporterSig });
        if (!existingReport) { const newReport = new Report({ roomCode, targetSig, reporterSig }); await newReport.save(); }
        const directRoomCommunicators = await Message.find({ roomCode }).distinct('senderSig');
        const totalActiveGroupMembersCount = Math.max(directRoomCommunicators.length, 1); 
        const specificUniqueReportsCount = await Report.countDocuments({ roomCode, targetSig });
        const structuralReportPercentageRatio = (specificUniqueReportsCount / totalActiveGroupMembersCount) * 100;

        if (structuralReportPercentageRatio >= 30) {
            const alreadyListed = await BanList.findOne({ roomCode, fingerprintId: targetSig });
            if (!alreadyListed) { const banEntry = new BanList({ roomCode, fingerprintId: targetSig }); await banEntry.save(); }
            io.to(roomCode).emit('user-banned-broadcast', { roomCode, fingerprintId: targetSig });
            return res.json({ evicted: true, message: "Participant has been banned." });
        }
        res.json({ evicted: false, message: "Report processed successfully." });
    } catch (err) {
        res.status(500).json({ error: "Failed to evaluate democratic report criteria rules." });
    }
});

// --- REAL-TIME SIGNAL TUNNEL LINKS ---
io.on('connection', (socket) => {
    socket.on('join-room', ({ roomCode, userAlias }) => {
        socket.join(roomCode);
    });
    socket.on('send-message', async (msgData) => {
        try {
            const loggedMsg = new Message({ roomCode: msgData.roomCode, sender: msgData.sender, senderSig: msgData.senderSig, text: msgData.text, type: msgData.type });
            await loggedMsg.save();
            io.to(msgData.roomCode).emit('receive-message', { id: loggedMsg._id.toString(), sender: loggedMsg.sender, senderSig: loggedMsg.senderSig, text: loggedMsg.text, type: loggedMsg.type });
        } catch (err) {
            console.error(err.message);
        }
    });
    socket.on('delete-message', async ({ roomCode, messageId }) => {
        try {
            await Message.findByIdAndDelete(messageId);
            io.to(roomCode).emit('message-burned', { messageId });
        } catch (err) {
            console.error(err.message);
        }
    });
});

// --- AUTOMATED 4 AM PURGE PIPELINE ---
let lastPurgeDate = null;
setInterval(async () => {
    const now = new Date();
    const currentHour = now.getHours();
    const todayString = now.toDateString();

    if (currentHour === CLOSE_HOUR && lastPurgeDate !== todayString) {
        try {
            await Message.deleteMany({});
            await Identity.deleteMany({});
            await Report.deleteMany({});
            await BanList.deleteMany({});
            
            io.emit('force-curfew-lock');
            lastPurgeDate = todayString; 
            console.log("🎯 SUCCESS: Ephemeral logs completely wiped at 4 AM.");
        } catch (err) {
            console.error("❌ CRITICAL PURGE ENGINE ERROR:", err.message);
        }
    }
}, 10000);

server.listen(PORT, () => console.log(`CurfewMe Engine live on port ${PORT}`));