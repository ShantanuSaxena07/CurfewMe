/**
 * curfew. - Secure Production Backend Engine with Democratic 30% Ban Multi-Schedules
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

// --- CONFIGURATION MANAGEMENT ---
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
mongoose.connect(process.env.MONGODB_URI)
    .then(() => console.log('Successfully established secure connection to MongoDB Atlas.'))
    .catch(err => console.error('CRITICAL DATABASE ERROR:', err.message));

// --- MONGOOSE SCHEMAS ---
const RoomSchema = new mongoose.Schema({
    roomCode: { type: String, required: true, unique: true, index: true },
    roomName: { type: String, required: true },
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

// --- STRICT ROOM JOINING CHECK VALIDATOR (CLEAN CONSOLE VERSION) ---
app.get('/api/verify-room/:code', async (req, res) => {
    // If curfew is active, return a successful status containing the curfew notice flag
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
                // Return status true but banned true to prevent throwing console errors
                return res.json({ allowed: false, isBanned: true, error: "You are banned from this group for today." });
            }
        }
        
        // Everything checks out perfectly
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
        if (existingIdentity) return res.json({ name: existingIdentity.alias });

        const claimedIdentities = await Identity.find().distinct('alias');
        const exclusionString = claimedIdentities.length > 0 ? `Do not select any names from this list: [${claimedIdentities.join(', ')}].` : '';
        const todayStr = new Date().toDateString();
        const prompt = `Generate ONE random famous character's identity. It must be EITHER a real name OR their fictional title, but NEVER both combined together (e.g. "Tony Stark", "Iron Man", "Harry Potter"). Today's seed modifier: ${todayStr}. ${exclusionString} Respond ONLY with a clean JSON structure matching this format exactly: {"name": "Character Name"}`;

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

        const newIdentity = new Identity({ fingerprintId, alias: identityData.name, oneLiner: "active" });
        await newIdentity.save();
        res.json(identityData);
    } catch (error) {
        const backups = ["Tony Stark", "Bruce Wayne", "Harry Potter", "Spider-Man"];
        res.json({ name: backups[Math.floor(Math.random() * backups.length)] });
    }
});

// --- DEMOCRATIC MODERATION SYSTEM EVALUATION PIPELINE ---
app.post('/api/report-user', async (req, res) => {
    const { roomCode, targetSig, reporterSig } = req.body;
    if (!roomCode || !targetSig || !reporterSig) return res.status(400).json({ error: "Missing required arguments parameters." });

    try {
        const existingReport = await Report.findOne({ roomCode, targetSig, reporterSig });
        if (!existingReport) {
            const newReport = new Report({ roomCode, targetSig, reporterSig });
            await newReport.save();
        }

        const directRoomCommunicators = await Message.find({ roomCode }).distinct('senderSig');
        const totalActiveGroupMembersCount = Math.max(directRoomCommunicators.length, 1); 

        const specificUniqueReportsCount = await Report.countDocuments({ roomCode, targetSig });
        const structuralReportPercentageRatio = (specificUniqueReportsCount / totalActiveGroupMembersCount) * 100;

        if (structuralReportPercentageRatio >= 30) {
            const alreadyListed = await BanList.findOne({ roomCode, fingerprintId: targetSig });
            if (!alreadyListed) {
                const banEntry = new BanList({ roomCode, fingerprintId: targetSig });
                await banEntry.save();
            }

            io.to(roomCode).emit('user-banned-broadcast', { roomCode, fingerprintId: targetSig });
            return res.json({ evicted: true, message: "Participant has crossed the 30% ratio line and has been banned." });
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
        console.log(`User [${userAlias}] inside Channel: ${roomCode}`);
    });

    socket.on('send-message', async (msgData) => {
        try {
            const loggedMsg = new Message({
                roomCode: msgData.roomCode,
                sender: msgData.sender,
                senderSig: msgData.senderSig,
                text: msgData.text,
                type: msgData.type
            });
            await loggedMsg.save();
            io.to(msgData.roomCode).emit('receive-message', {
                id: loggedMsg._id.toString(),
                sender: loggedMsg.sender,
                senderSig: loggedMsg.senderSig,
                text: loggedMsg.text,
                type: loggedMsg.type
            });
        } catch (err) {
            console.error("Failed to save message:", err.message);
        }
    });

    socket.on('delete-message', async ({ roomCode, messageId }) => {
        try {
            await Message.findByIdAndDelete(messageId);
            io.to(roomCode).emit('message-burned', { messageId });
        } catch (err) {
            console.error("Failed to delete message:", err.message);
        }
    });
});

// --- AUTOMATED CRON-STYLE PURGE PIPELINE (IST ENGINE ON) ---
let lastPurgeDate = null;

setInterval(async () => {
    if (IS_DEV_MODE) return; 
    
    // 1. Fetch current time based on the server's configured environment timezone (Ensure TZ variable is Asia/Kolkata on Render!)
    const now = new Date();
    const currentHour = now.getHours();
    const todayString = now.toDateString();

    // 2. Trigger the wipe if it's the 4 AM hour and we haven't already successfully executed a purge today
    if (currentHour === CLOSE_HOUR && lastPurgeDate !== todayString) {
        console.log("🚀 CURFEW PURGE TRIGGERED: Initiating dynamic database cleanse...");
        try {
            // Drop everything to refresh identities, remove bans, clear logs, and delete rooms
            await Room.deleteMany({});
            await Message.deleteMany({});
            await Identity.deleteMany({});
            await Report.deleteMany({});
            await BanList.deleteMany({});
            
            // Broadcast lock signal to any lingering socket instances
            io.emit('force-curfew-lock');
            
            // Mark today's execution as complete so it doesn't loop continuously during the 4 AM hour
            lastPurgeDate = todayString; 
            console.log("🎯 SUCCESS: All ephemeral database entries completely wiped for the new day.");
        } catch (err) {
            console.error("❌ CRITICAL PURGE ENGINE ERROR:", err.message);
        }
    }
}, 10000); // Checks every 10 seconds (resource efficient and impossible to skip)

// ...
server.listen(PORT, () => console.log(`CurfewMe Secure Engine live on port ${PORT}`));