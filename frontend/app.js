/**
 * curfew. - High-End Real-Time Frontend Engine with Democratic Report Capabilities
 */

const SERVER_URL = window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1"
    ? "http://localhost:8080"
    : "https://curfewme-backend.onrender.com"; // <-- Replace this with your actual live Render URL later

const IS_DEV_MODE = true; 

let socket = null;
let currentRoomCode = null;
let currentUser = { alias: '' };
let isFetchingIdentity = false; 
let targetReportContext = null; // Memory node holding user coordinates during moderation alerts

const DOM = {
    mainAppHeader: document.getElementById('main-app-header'),
    dayScreen: document.getElementById('day-screen'),
    nightScreen: document.getElementById('night-screen'),
    countdown: document.getElementById('countdown'),
    userAlias: document.getElementById('user-alias'),
    feedView: document.getElementById('feed-view'),
    chatView: document.getElementById('chat-view'),
    roomsContainer: document.getElementById('rooms-container'),
    openModalBtn: document.getElementById('open-modal-btn'),
    leaveChatBtn: document.getElementById('leave-chat-btn'),
    currentRoomTitle: document.getElementById('current-room-title'),
    chatInput: document.getElementById('chat-input'),
    sendBtn: document.getElementById('send-btn'),
    messagesContainer: document.getElementById('messages-container'),
    customModal: document.getElementById('custom-modal'),
    modalTitle: document.getElementById('modal-title'),
    modalInput: document.getElementById('modal-input'),
    modalCancel: document.getElementById('modal-cancel'),
    modalConfirm: document.getElementById('modal-confirm'),
    choiceView: document.getElementById('modal-choice-view'),
    successView: document.getElementById('modal-success-view'),
    choiceCreateBtn: document.getElementById('choice-create-btn'),
    choiceJoinBtn: document.getElementById('choice-join-btn'),
    generatedCodeDisplay: document.getElementById('generated-code-display'),
    copyCodeBtn: document.getElementById('copy-code-btn'),
    attachBtn: document.getElementById('attach-btn'),
    fileInput: document.getElementById('file-input'),
    modalErrorText: document.getElementById('modal-error-text'),
    themeToggleCheckbox: document.getElementById('theme-toggle-checkbox'),
    // Moderation Nodes
    reportModal: document.getElementById('report-modal'),
    reportCancel: document.getElementById('report-cancel'),
    reportConfirm: document.getElementById('report-confirm')
};

let currentModalState = 'choice'; 

// --- 1. RUNTIME TIMELINE ENGINE ---
function monitorCurfew() {
    if (IS_DEV_MODE) {
        DOM.dayScreen.classList.add('hidden');
        DOM.nightScreen.classList.remove('hidden');
        if (!socket) initializeRealTimeSocket();
        if (!currentUser.alias) fetchIdentitySecurely();
        return;
    }

    const now = new Date();
    const isLive = (now.getHours() >= 19 || now.getHours() < 4);

    if (isLive) {
        DOM.dayScreen.classList.add('hidden');
        DOM.nightScreen.classList.remove('hidden');
        if (!socket) initializeRealTimeSocket();
        if (!currentUser.alias) fetchIdentitySecurely();
    } else {
        lockDownApp();
        calculateCountdown(now);
    }
}

function calculateCountdown(now) {
    const target = new Date(now);
    target.setHours(19, 0, 0, 0);
    if (now.getHours() >= 19) target.setDate(target.getDate() + 1);
    const diff = target - now;
    const h = String(Math.floor(diff / 3600000)).padStart(2, '0');
    const m = String(Math.floor((diff % 3600000) / 60000)).padStart(2, '0');
    const s = String(Math.floor((diff % 60000) / 1000)).padStart(2, '0');
    DOM.countdown.innerText = `${h}:${m}:${s}`;
}

function lockDownApp() {
    DOM.dayScreen.classList.remove('hidden');
    DOM.nightScreen.classList.add('hidden');
    DOM.roomsContainer.innerHTML = ''; 
    localStorage.removeItem('curfew_device_fingerprint'); 
    currentUser = { alias: '' };
    currentRoomCode = null;
    if (socket) {
        socket.disconnect();
        socket = null;
    }
}

// --- 2. IDENTITY SYSTEM ---
function getOrCreateFingerprintToken() {
    let fingerprint = localStorage.getItem('curfew_device_fingerprint');
    if (!fingerprint) {
        fingerprint = 'dev_sig_' + Math.random().toString(36).substr(2, 9) + Date.now().toString(36);
        localStorage.setItem('curfew_device_fingerprint', fingerprint);
    }
    return fingerprint;
}

async function fetchIdentitySecurely() {
    if (isFetchingIdentity || currentUser.alias) return;
    isFetchingIdentity = true; 
    DOM.userAlias.innerText = "Fetching...";
    
    const clientSignatureHash = getOrCreateFingerprintToken();
    
    try {
        const response = await fetch(`${SERVER_URL}/api/get-identity`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ fingerprintId: clientSignatureHash })
        });
        if (!response.ok) throw new Error(`HTTP error: ${response.status}`);
        const data = await response.json();
        
        currentUser.alias = data.name;
        DOM.userAlias.innerText = currentUser.alias; 
        renderPersistentRoomTabs(); 
    } catch (err) {
        currentUser.alias = "Tony Stark";
        DOM.userAlias.innerText = currentUser.alias;
        renderPersistentRoomTabs();
    } finally {
        if (currentUser.alias) isFetchingIdentity = false;
    }
}

// --- 3. PERSISTENT TABS GRID ---
function saveChannelToPersistence(roomCode, roomName) {
    let savedRooms = JSON.parse(localStorage.getItem('curfew_rooms_map')) || {};
    savedRooms[roomCode] = roomName;
    localStorage.setItem('curfew_rooms_map', JSON.stringify(savedRooms));
    renderPersistentRoomTabs();
}

function renderPersistentRoomTabs() {
    let savedRooms = JSON.parse(localStorage.getItem('curfew_rooms_map')) || {};
    DOM.roomsContainer.innerHTML = '';

    const keys = Object.keys(savedRooms);
    
    // 1. UPGRADED: Clean, non-bordered empty message strip statement
    if (keys.length === 0) {
        DOM.roomsContainer.innerHTML = `
            <p class="empty-channels-notice">
                Tap the button below to join or create a channel
            </p>`;
        return;
    }

    // 2. UPGRADED: Full-viewport scale cards printing separated sub-code prefixes
    keys.forEach(code => {
        const card = document.createElement('div');
        card.className = 'group-card';
        card.innerHTML = `
            <div class="card-title-stack">
                <span class="group-name">${savedRooms[code]}</span>
                <span class="group-code-sub">Code : - ${code}</span>
            </div>
            <span class="status-dot active"></span>
        `;
        card.addEventListener('click', () => joinActiveChannel(code, savedRooms[code]));
        DOM.roomsContainer.appendChild(card);
    });
}

// --- 4. SOCKET COMMUNICATIONS LINK ---
function initializeRealTimeSocket() {
    if (typeof io === 'undefined') return;
    socket = io(SERVER_URL);

    socket.on('force-curfew-lock', () => lockDownApp());
    socket.on('receive-message', (msg) => displayMessage(msg));
    
    socket.on('message-burned', ({ messageId }) => {
        const targetedMsgCard = document.getElementById(messageId);
        if (targetedMsgCard) {
            targetedMsgCard.classList.add('burning');
            setTimeout(() => targetedMsgCard.remove(), 800);
        }
    });

    // 4. MODERATION LISTENER: Force-evict users if they cross the ban margin rule
    socket.on('user-banned-broadcast', ({ roomCode, fingerprintId }) => {
        const currentLocalSig = localStorage.getItem('curfew_device_fingerprint');
        if (currentRoomCode === roomCode && currentLocalSig === fingerprintId) {
            DOM.chatView.classList.add('hidden');
            DOM.feedView.classList.remove('hidden');
            DOM.mainAppHeader.classList.remove('hidden');
            currentRoomCode = null;
            
            resetModalLayout();
            DOM.customModal.classList.remove('hidden');
            DOM.modalTitle.innerText = "Evicted";
            DOM.modalErrorText.innerText = "You have been banned from this group for today by vote.";
            DOM.modalErrorText.classList.remove('hidden');
            renderPersistentRoomTabs();
        }
    });
}

// --- 5. COMPONENT MODAL DIALOG CONTROLLER ---
function resetModalLayout() {
    currentModalState = 'choice';
    DOM.modalTitle.innerText = "Select Action";
    DOM.choiceView.classList.remove('hidden');
    DOM.modalInput.classList.add('hidden');
    DOM.successView.classList.add('hidden');
    DOM.modalConfirm.classList.add('hidden');
    DOM.modalErrorText.classList.add('hidden'); 
    DOM.modalConfirm.innerText = "Confirm";
    DOM.modalInput.value = '';
    DOM.modalInput.removeAttribute('maxlength');
}

DOM.openModalBtn.addEventListener('click', () => {
    resetModalLayout();
    DOM.customModal.classList.remove('hidden');
});

DOM.modalCancel.addEventListener('click', () => {
    DOM.customModal.classList.add('hidden');
});

DOM.modalInput.addEventListener('input', () => {
    DOM.modalErrorText.classList.add('hidden');
});

DOM.choiceCreateBtn.addEventListener('click', () => {
    currentModalState = 'create-input';
    DOM.modalTitle.innerText = "Create Group Channel";
    DOM.choiceView.classList.add('hidden');
    DOM.modalInput.classList.remove('hidden');
    DOM.modalConfirm.classList.remove('hidden');
    DOM.modalInput.placeholder = "Room Name";
    DOM.modalInput.maxLength = 20;
    DOM.modalInput.focus();
});

DOM.choiceJoinBtn.addEventListener('click', () => {
    currentModalState = 'join-input';
    DOM.modalTitle.innerText = "Join Group Channel";
    DOM.choiceView.classList.add('hidden');
    DOM.modalInput.classList.remove('hidden');
    DOM.modalConfirm.classList.remove('hidden');
    DOM.modalInput.placeholder = "Enter 6-Digit Code";
    DOM.modalInput.maxLength = 6;
    DOM.modalInput.focus();
});

DOM.modalConfirm.addEventListener('click', async () => {
    const rawVal = DOM.modalInput.value.trim();

    if (currentModalState === 'create-input') {
        if (!rawVal) return;
        try {
            const response = await fetch(`${SERVER_URL}/api/create-room`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ roomName: rawVal })
            });
            const data = await response.json();
            if (!response.ok) throw new Error(data.error);

            currentModalState = 'success';
            DOM.modalTitle.innerText = `Group Created: ${data.roomName}`;
            DOM.modalInput.classList.add('hidden');
            DOM.successView.classList.remove('hidden');
            DOM.generatedCodeDisplay.innerText = data.roomCode;
            DOM.modalConfirm.innerText = "Enter Room";

            saveChannelToPersistence(data.roomCode, data.roomName);
            
            DOM.copyCodeBtn.onclick = () => {
                navigator.clipboard.writeText(data.roomCode);
                DOM.copyCodeBtn.innerText = "Copied!";
                setTimeout(() => { DOM.copyCodeBtn.innerText = "Copy Code"; }, 2000);
            };

        } catch (err) {
            DOM.modalErrorText.innerText = err.message || "Failed to create channel.";
            DOM.modalErrorText.classList.remove('hidden');
        }
    } 
    else if (currentModalState === 'join-input') {
        if (!/^\d{6}$/.test(rawVal)) {
            DOM.modalErrorText.innerText = "Invalid Code !!";
            DOM.modalErrorText.classList.remove('hidden');
            return;
        }
        
        try {
            // 4. DEMOCRATIC BAN SAFETY SYSTEM: Transmit client device hash key string on entry checks
            const clientSig = getOrCreateFingerprintToken();
            const response = await fetch(`${SERVER_URL}/api/verify-room/${rawVal}?sig=${clientSig}`);
            const data = await response.json();

            if (!response.ok) {
                // If backend states user is blocked, print specific ban statement warning
                DOM.modalErrorText.innerText = data.error || "Invalid Code !!";
                DOM.modalErrorText.classList.remove('hidden');
                return;
            }

            saveChannelToPersistence(data.roomCode, data.roomName);
            DOM.customModal.classList.add('hidden');
            joinActiveChannel(data.roomCode, data.roomName);

        } catch (err) {
            DOM.modalErrorText.innerText = "Invalid Code !!";
            DOM.modalErrorText.classList.remove('hidden');
        }
    }
    else if (currentModalState === 'success') {
        const activeCode = DOM.generatedCodeDisplay.innerText;
        let savedRooms = JSON.parse(localStorage.getItem('curfew_rooms_map')) || {};
        DOM.customModal.classList.add('hidden');
        joinActiveChannel(activeCode, savedRooms[activeCode]);
    }
});

// --- 6. NAVIGATION NAVIGATION SYSTEM ---
async function joinActiveChannel(roomCode, roomName) {
    currentRoomCode = roomCode;
    
    DOM.mainAppHeader.classList.add('hidden');
    DOM.feedView.classList.add('hidden');
    DOM.chatView.classList.remove('hidden');
    DOM.currentRoomTitle.innerText = roomName || `Room: ${roomCode}`;
    DOM.messagesContainer.innerHTML = '<div class="screenshot-overlay">No Screenshots\nDue to Privacy Reasons</div>'; 

    try {
        const response = await fetch(`${SERVER_URL}/api/rooms/${roomCode}/messages`);
        if (response.ok) {
            const dailyLogsHistory = await response.json();
            dailyLogsHistory.forEach(msg => {
                displayMessage({
                    id: msg._id,
                    sender: msg.sender,
                    senderSig: msg.senderSig, // Map hardware key signatures safely down template
                    text: msg.text,
                    type: msg.type
                });
            });
        }
    } catch (err) {
        console.warn("Unable to sync chat history components:", err.message);
    }

    if (socket) {
        socket.emit('join-room', { roomCode: currentRoomCode, userAlias: currentUser.alias });
    }
}

DOM.leaveChatBtn.replaceWith(DOM.leaveChatBtn.cloneNode(true));
document.getElementById('leave-chat-btn').addEventListener('click', () => {
    DOM.chatView.classList.add('hidden');
    DOM.feedView.classList.remove('hidden');
    currentRoomCode = null;
    DOM.mainAppHeader.classList.remove('hidden');
    renderPersistentRoomTabs(); 
});

// --- 7. FILE PROCESSING TRANSMISSIONS CONTROLLERS ---
function linkifyText(text) {
    const urlPattern = /(\b(https?|ftp|file):\/\/[-A-Z0-9+&@#\/%?=~_|!:,.;]*[-A-Z0-9+&@#\/%=~_|])/ig;
    return text.replace(urlPattern, '<a href="$1" target="_blank" class="msg-link">$1</a>');
}

function dispatchOutgoingMessage() {
    const text = DOM.chatInput.value.trim();
    if (!text || !currentRoomCode) return;

    const clientSig = getOrCreateFingerprintToken();

    socket.emit('send-message', {
        roomCode: currentRoomCode,
        sender: currentUser.alias,
        senderSig: clientSig, // Include hardware tracking signature variables inside frame
        text: text,
        type: 'text'
    });

    DOM.chatInput.value = '';
}

DOM.attachBtn.addEventListener('click', () => DOM.fileInput.click());

DOM.fileInput.addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (!file || !currentRoomCode) return;

    if (file.type.startsWith('video/')) {
        resetModalLayout();
        DOM.customModal.classList.remove('hidden');
        DOM.modalTitle.innerText = "Upload Blocked";
        DOM.modalErrorText.innerText = "Video transmissions are disabled to protect security logs.";
        DOM.modalErrorText.classList.remove('hidden');
        DOM.fileInput.value = '';
        return;
    }

    const fileSizeMB = file.size / (1024 * 1024);

    if (file.type === 'image/gif') {
        if (fileSizeMB > 3) {
            resetModalLayout();
            DOM.customModal.classList.remove('hidden');
            DOM.modalTitle.innerText = "GIF Too Large";
            DOM.modalErrorText.innerText = "Animated GIFs must be under 3MB to optimize room performance.";
            DOM.modalErrorText.classList.remove('hidden');
            DOM.fileInput.value = '';
            return;
        }

        const reader = new FileReader();
        reader.onload = function (event) {
            const clientSig = getOrCreateFingerprintToken();
            socket.emit('send-message', {
                roomCode: currentRoomCode,
                sender: currentUser.alias,
                senderSig: clientSig,
                text: event.target.result,
                type: 'image'
            });
        };
        reader.readAsDataURL(file);
        DOM.fileInput.value = '';
        return;
    }

    if (file.type.startsWith('image/')) {
        const reader = new FileReader();
        reader.onload = function (event) {
            const imgElement = new Image();
            imgElement.src = event.target.result;

            imgElement.onload = function () {
                const canvas = document.createElement('canvas');
                const ctx = canvas.getContext('2d');

                let width = imgElement.width;
                let height = imgElement.height;
                const MAX_DIMENSION = 800; 

                if (width > height) {
                    if (width > MAX_DIMENSION) {
                        height *= MAX_DIMENSION / width;
                        width = MAX_DIMENSION;
                    }
                } else {
                    if (height > MAX_DIMENSION) {
                        width *= MAX_DIMENSION / height;
                        height = MAX_DIMENSION;
                    }
                }

                canvas.width = width;
                canvas.height = height;
                ctx.drawImage(imgElement, 0, 0, width, height);

                const compressedBase64 = canvas.toDataURL('image/jpeg', 0.5);
                const clientSig = getOrCreateFingerprintToken();

                socket.emit('send-message', {
                    roomCode: currentRoomCode,
                    sender: currentUser.alias,
                    senderSig: clientSig,
                    text: compressedBase64,
                    type: 'image'
                });
            };
        };
        reader.readAsDataURL(file);
        DOM.fileInput.value = '';
        return;
    }
    DOM.fileInput.value = '';
});

function displayMessage(msg) {
    const isMe = (msg.senderSig === getOrCreateFingerprintToken() || msg.sender === currentUser.alias);
    const msgWrapper = document.createElement('div');
    msgWrapper.className = `msg-wrapper ${isMe ? 'outgoing' : 'incoming'}`;
    msgWrapper.id = msg.id; 
    
    let bubbleContent = '';
    if (msg.type === 'image') {
        bubbleContent = `<img src="${msg.text}" class="msg-media" alt="Attachment">`;
    } else {
        bubbleContent = linkifyText(msg.text);
    }
    
    // 4. DEMOCRATIC BAN MODERATION MODULE UI STAMP: Append reporting handle triggers natively into lines
    msgWrapper.innerHTML = `
        <div class="msg-meta" data-sig="${msg.senderSig}" data-name="${msg.sender}">
            ${isMe ? 'You (' + msg.sender + ')' : msg.sender}
            ${!isMe ? '<span class="report-inline-trigger">Report</span>' : ''}
        </div>
        <div class="msg-bubble">${bubbleContent}</div>
    `;

    // Outgoing Message Long Press (Burn Event)
    if (isMe) {
        let burnTimer = null;

        const startChargingBurn = (e) => {
            if (e.type === 'touchstart') e.preventDefault(); 
            msgWrapper.classList.add('charging');
            
            // 5. UPGRADED: Burn activation window altered from 2 seconds down to exactly 1 second (1000ms)
            burnTimer = setTimeout(() => {
                if (socket && currentRoomCode) {
                    socket.emit('delete-message', { roomCode: currentRoomCode, messageId: msg.id });
                }
                clearChargingBurn();
            }, 1000);
        };

        const clearChargingBurn = () => {
            msgWrapper.classList.remove('charging');
            if (burnTimer) {
                clearTimeout(burnTimer);
                burnTimer = null;
            }
        };

        msgWrapper.addEventListener('mousedown', startChargingBurn);
        msgWrapper.addEventListener('mouseup', clearChargingBurn);
        msgWrapper.addEventListener('mouseleave', clearChargingBurn);
        msgWrapper.addEventListener('touchstart', startChargingBurn, { passive: false });
        msgWrapper.addEventListener('touchend', clearChargingBurn);
        msgWrapper.addEventListener('touchcancel', clearChargingBurn);
    } 
    // Incoming Message Long Press / Click (Report Event)
    else {
        const metaNode = msgWrapper.querySelector('.msg-meta');
        
        // Setup simple click trigger on user meta header line to reveal report prompt box
        metaNode.addEventListener('click', () => {
            targetReportContext = {
                roomCode: currentRoomCode,
                targetSig: msg.senderSig,
                targetName: msg.sender,
                reporterSig: getOrCreateFingerprintToken()
            };
            DOM.reportModal.classList.remove('hidden');
        });
    }

    DOM.messagesContainer.appendChild(msgWrapper);
    DOM.messagesContainer.scrollTop = DOM.messagesContainer.scrollHeight;
}

// Wire Moderation Dialog button event pathways
DOM.reportCancel.addEventListener('click', () => {
    DOM.reportModal.classList.add('hidden');
    targetReportContext = null;
});

DOM.reportConfirm.addEventListener('click', async () => {
    if (!targetReportContext) return;
    
    try {
        const response = await fetch(`${SERVER_URL}/api/report-user`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(targetReportContext)
        });
        const data = await response.json();
        DOM.reportModal.classList.add('hidden');
        
        if (response.ok && data.evicted) {
            alert(`User ${targetReportContext.targetName} has crossed the 30% threshold and has been restricted from the group.`);
        } else {
            alert(data.message || "Report filed successfully.");
        }
    } catch(err) {
        console.error("Moderation communication crash:", err);
    } finally {
        targetReportContext = null;
    }
});

DOM.sendBtn.addEventListener('click', dispatchOutgoingMessage);
DOM.chatInput.addEventListener('keypress', (e) => { if (e.key === 'Enter') dispatchOutgoingMessage(); });

// --- 8. DEFENSIVE CANVAS ANOMALY BLOCKS ---
window.addEventListener('blur', () => {
    const overlay = document.querySelector('.screenshot-overlay');
    if (overlay && !DOM.chatView.classList.contains('hidden')) {
        overlay.style.display = 'flex'; 
        DOM.messagesContainer.classList.add('frozen-lockdown'); 
    }
});
window.addEventListener('focus', () => {
    const overlay = document.querySelector('.screenshot-overlay');
    if (overlay) {
        overlay.style.display = 'none';
        DOM.messagesContainer.classList.remove('frozen-lockdown'); 
    }
});
window.addEventListener('keydown', (e) => {
    if ((e.metaKey && e.shiftKey) || (e.ctrlKey && e.shiftKey) || e.key === 'PrintScreen') {
        const stream = DOM.messagesContainer;
        stream.style.filter = 'blur(40px)';
        setTimeout(() => { stream.style.filter = 'none'; }, 2000);
    }
});

// --- 9. PILL THEME TOGGLE ROUTINE ---
function initializeApplicationTheme() {
    const savedTheme = localStorage.getItem('curfew_visual_theme');
    if (savedTheme === 'light') {
        document.body.classList.add('light-theme');
        DOM.themeToggleCheckbox.checked = false; 
    } else {
        document.body.classList.remove('light-theme');
        DOM.themeToggleCheckbox.checked = true; 
    }
}

DOM.themeToggleCheckbox.addEventListener('change', () => {
    if (DOM.themeToggleCheckbox.checked) {
        document.body.classList.remove('light-theme');
        localStorage.setItem('curfew_visual_theme', 'dark');
    } else {
        document.body.classList.add('light-theme');
        localStorage.setItem('curfew_visual_theme', 'light');
    }
});

initializeApplicationTheme();
setInterval(monitorCurfew, 1000);
monitorCurfew();