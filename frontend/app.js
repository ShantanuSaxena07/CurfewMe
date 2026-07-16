/**
 * curfew. - Consolidated Production Frontend Engine
 */

const SERVER_URL = window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1"
    ? "http://localhost:8080"
    : "https://curfewme-backend.onrender.com";

const IS_DEV_MODE = true;

let socket = null;
let currentRoomCode = null;
let currentUser = { alias: '' };
let currentActiveViewTab = "groups"; 
let activeLongPressContextUser = null; 
let isFetchingIdentity = false;

const UI = {
    loaderOverlay: document.getElementById('global-loader-overlay'),
    sidebar: document.getElementById('app-hamburger-sidebar'),
    openSidebarBtn: document.getElementById('sidebar-open-toggle'),
    closeSidebarBtn: document.getElementById('close-sidebar-btn'),
    tabGroups: document.getElementById('tab-trigger-groups'),
    tabDMs: document.getElementById('tab-trigger-dms'),
    tabIndicator: document.getElementById('sliding-active-tab-indicator'),
    // Embedded Custom About Overlay Layer Mappings
    aboutModal: document.getElementById('about-platform-modal'),
    aboutCloseBtn: document.getElementById('about-close-modal-btn'),
    sidebarTriggerAbout: document.getElementById('sidebar-trigger-about'),
    sidebarTriggerFeedback: document.getElementById('sidebar-trigger-feedback'),
    // Context DM naming dialog
    dmModal: document.getElementById('dm-naming-modal'),
    dmInput: document.getElementById('dm-custom-name-input'),
    dmCancel: document.getElementById('dm-name-cancel'),
    dmConfirm: document.getElementById('dm-name-confirm'),
    // Identity Splash Card
    splashModal: document.getElementById('identity-splash-modal'),
    splashHero: document.getElementById('splash-hero-name'),
    splashPowers: document.getElementById('splash-powers-text'),
    splashDesc: document.getElementById('splash-desc-text'),
    splashClose: document.getElementById('splash-close-btn'),
    // Feedback panel elements
    feedbackModal: document.getElementById('feedback-modal'),
    feedbackText: document.getElementById('feedback-textbox-area'),
    feedbackCancel: document.getElementById('feedback-cancel-btn'),
    feedbackSubmit: document.getElementById('feedback-submit-btn'),
    // Context Actions Menu Sheet
    contextModal: document.getElementById('context-action-modal'),
    contextTitle: document.getElementById('context-action-title'),
    contextDM: document.getElementById('context-trigger-dm'),
    contextReport: document.getElementById('context-trigger-report'),
    contextCancel: document.getElementById('context-trigger-cancel')
};

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
    reportModal: document.getElementById('report-modal'),
    reportCancel: document.getElementById('report-cancel'),
    reportConfirm: document.getElementById('report-confirm')
};

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
        if (UI.loaderOverlay && UI.loaderOverlay.style.display !== "none") {
            UI.loaderOverlay.style.opacity = "0";
            setTimeout(() => { UI.loaderOverlay.style.display = "none"; }, 400);
        }
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

function getOrCreateFingerprintToken() {
    let fingerprint = localStorage.getItem('curfew_device_fingerprint');
    if (!fingerprint) {
        fingerprint = 'sig_' + Math.random().toString(36).substr(2, 9) + Date.now().toString(36);
        localStorage.setItem('curfew_device_fingerprint', fingerprint);
    }
    return fingerprint;
}

async function fetchIdentitySecurely() {
    if (isFetchingIdentity || currentUser.alias) return;
    isFetchingIdentity = true;
    UI.loaderOverlay.style.display = "flex";
    UI.loaderOverlay.style.opacity = "1";
    const clientSignatureHash = getOrCreateFingerprintToken();
    try {
        const response = await fetch(`${SERVER_URL}/api/get-identity`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ fingerprintId: clientSignatureHash })
        });
        const data = await response.json();
        currentUser.alias = data.name;
        DOM.userAlias.innerText = currentUser.alias;
        if (data.isNew) {
            UI.splashHero.innerText = data.name;
            UI.splashPowers.innerText = data.powers || "Unknown Variant";
            UI.splashDesc.innerText = data.description || "No cosmic matrix database logs.";
            UI.splashModal.classList.remove('hidden');
        }
        renderPersistentRoomTabs();
    } catch (err) {
        currentUser.alias = "Tony Stark";
        DOM.userAlias.innerText = currentUser.alias;
        renderPersistentRoomTabs();
    } finally {
        isFetchingIdentity = false;
        setTimeout(() => {
            UI.loaderOverlay.style.opacity = "0";
            setTimeout(() => { UI.loaderOverlay.style.display = "none"; }, 400);
        }, 600);
    }
}

// --- 3. FULL-WIDTH SWITCH SLIDER TAB TRANSLATIONS ---
UI.tabGroups.addEventListener('click', () => {
    currentActiveViewTab = "groups";
    UI.tabIndicator.style.transform = "translateX(0%)";
    UI.tabGroups.classList.add('active-text');
    UI.tabDMs.classList.remove('active-text');
    UI.openSidebarBtn.style.display = "flex";
    DOM.openModalBtn.classList.remove('hidden');
    renderPersistentRoomTabs();
});

UI.tabDMs.addEventListener('click', () => {
    currentActiveViewTab = "dms";
    UI.tabIndicator.style.transform = "translateX(100%)";
    UI.tabDMs.classList.add('active-text');
    UI.tabGroups.classList.remove('active-text');
    DOM.openModalBtn.classList.add('hidden');
    renderPersistentRoomTabs();
});

function saveChannelToPersistence(roomCode, roomName, isPrivateDM = false) {
    const storageKey = isPrivateDM ? 'curfew_dms_map' : 'curfew_rooms_map';
    let savedRooms = JSON.parse(localStorage.getItem(storageKey)) || {};
    savedRooms[roomCode] = roomName;
    localStorage.setItem(storageKey, JSON.stringify(savedRooms));
    renderPersistentRoomTabs();
}

async function renderPersistentRoomTabs() {
    DOM.roomsContainer.innerHTML = '';
    const storageKey = (currentActiveViewTab === "dms") ? 'curfew_dms_map' : 'curfew_rooms_map';
    let savedRooms = JSON.parse(localStorage.getItem(storageKey)) || {};
    const keys = Object.keys(savedRooms);

    if (keys.length === 0) {
        DOM.roomsContainer.innerHTML = `<p class="empty-channels-notice">No conversation records in this stack today.</p>`;
        return;
    }

    const clientSig = getOrCreateFingerprintToken();

    for (const code of keys) {
        const card = document.createElement('div');
        card.className = 'group-card';
        card.innerHTML = `
            <div class="card-title-stack">
                <span class="group-name">${savedRooms[code]}</span>
                <span class="group-code-sub">${currentActiveViewTab === 'dms' ? 'Private Session Room' : 'Code : - ' + code}</span>
            </div>
            <span class="status-dot active"></span>
        `;
        try {
            const response = await fetch(`${SERVER_URL}/api/verify-room/${code}?sig=${clientSig}`);
            const data = await response.json();
            if (data.isBanned) {
                card.classList.add('banned-curfew');
            } else {
                card.addEventListener('click', () => joinActiveChannel(code, savedRooms[code]));
            }
        } catch (err) {
            card.addEventListener('click', () => joinActiveChannel(code, savedRooms[code]));
        }
        DOM.roomsContainer.appendChild(card);
    }
}

// --- 4. SIDEBAR DRAWER INTERACTION PATHWAYS ---
UI.openSidebarBtn.addEventListener('click', (e) => {
    e.stopPropagation(); // Stop window bubble
    UI.sidebar.classList.remove('drawer-closed');
    UI.sidebar.classList.add('drawer-open');
});

UI.closeSidebarBtn.addEventListener('click', () => {
    UI.sidebar.classList.remove('drawer-open');
    UI.sidebar.classList.add('drawer-closed');
});

// 🛠️ CLOSE SIDEBAR AUTOMATICALLY UPON CLICKING OUTSIDE BOUNDARIES
window.addEventListener('click', (e) => {
    if (UI.sidebar.classList.contains('drawer-open')) {
        if (!UI.sidebar.contains(e.target) && e.target !== UI.openSidebarBtn) {
            UI.sidebar.classList.remove('drawer-open');
            UI.sidebar.classList.add('drawer-closed');
        }
    }
});

// EMBEDDED CUSTOM ABOUT SCREEN OVERLAY TRIGGER
UI.sidebarTriggerAbout.addEventListener('click', () => {
    UI.sidebar.classList.remove('drawer-open');
    UI.sidebar.classList.add('drawer-closed');
    UI.aboutModal.classList.remove('hidden');
});
UI.aboutCloseBtn.addEventListener('click', () => UI.aboutModal.classList.add('hidden'));

UI.sidebarTriggerFeedback.addEventListener('click', () => {
    UI.sidebar.classList.remove('drawer-open');
    UI.sidebar.classList.add('drawer-closed');
    UI.feedbackModal.classList.remove('hidden');
});
UI.feedbackCancel.addEventListener('click', () => UI.feedbackModal.classList.add('hidden'));
UI.feedbackSubmit.addEventListener('click', async () => {
    const feedbackBodyText = UI.feedbackText.value.trim();
    if (!feedbackBodyText) return;
    try {
        await fetch(`${SERVER_URL}/api/feedback`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ text: feedbackBodyText, alias: currentUser.alias })
        });
        alert("Your configuration review was securely transmitted.");
        UI.feedbackText.value = "";
        UI.feedbackModal.classList.add('hidden');
    } catch (err) {
        console.error(err);
    }
});

// --- 5. TIMED LONG PRESS CAPABILITIES CONTROLLER ---
function registerLongPressUserMeta(metaNode, messageSenderSig, messageSenderName) {
    let pressTimer = null;
    const fireOptionDialogue = () => {
        if (messageSenderSig === getOrCreateFingerprintToken()) return;
        activeLongPressContextUser = { sig: messageSenderSig, name: messageSenderName };
        UI.contextTitle.innerText = `Target Node: ${messageSenderName}`;
        UI.contextModal.classList.remove('hidden');
    };
    metaNode.addEventListener('mousedown', () => { pressTimer = setTimeout(fireOptionDialogue, 500); });
    metaNode.addEventListener('mouseup', () => { clearTimeout(pressTimer); });
    metaNode.addEventListener('mouseleave', () => { clearTimeout(pressTimer); });
    metaNode.addEventListener('touchstart', () => { pressTimer = setTimeout(fireOptionDialogue, 500); });
    metaNode.addEventListener('touchend', () => { clearTimeout(pressTimer); });
}

UI.contextCancel.addEventListener('click', () => { UI.contextModal.classList.add('hidden'); activeLongPressContextUser = null; });
UI.contextDM.addEventListener('click', () => { UI.contextModal.classList.add('hidden'); UI.dmInput.value = ""; UI.dmModal.classList.remove('hidden'); });
UI.dmCancel.addEventListener('click', () => UI.dmModal.classList.add('hidden'));
UI.dmConfirm.addEventListener('click', async () => {
    const customDMName = UI.dmInput.value.trim();
    if (!customDMName) return;
    UI.dmModal.classList.add('hidden');
    const creatorSig = getOrCreateFingerprintToken();
    try {
        const response = await fetch(`${SERVER_URL}/api/create-dm`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ targetSig: activeLongPressContextUser.sig, roomName: customDMName, creatorSig: creatorSig })
        });
        const data = await response.json();
        saveChannelToPersistence(data.roomCode, data.roomName, true);
        currentActiveViewTab = "dms";
        UI.tabIndicator.style.transform = "translateX(100%)";
        UI.tabDMs.classList.add('active-text');
        UI.tabGroups.classList.remove('active-text');
        joinActiveChannel(data.roomCode, data.roomName);
    } catch (err) {
        console.error(err);
    }
});

UI.contextReport.addEventListener('click', async () => {
    if (!activeLongPressContextUser || !currentRoomCode) return;
    UI.contextModal.classList.add('hidden');
    const confirmReport = confirm(`Log a democratic moderation report against ${activeLongPressContextUser.name}?`);
    if (!confirmReport) return;
    try {
        const response = await fetch(`${SERVER_URL}/api/report-user`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ roomCode: currentRoomCode, targetSig: activeLongPressContextUser.sig, reporterSig: getOrCreateFingerprintToken() })
        });
        const data = await response.json();
        if (data.evicted) {
            alert(`User ${activeLongPressContextUser.name} has crossed the 30% limit and has been restricted from the channel lounge space.`);
        } else {
            alert(data.message || "Democratic report filed successfully.");
        }
    } catch (err) {
        console.error(err);
    } finally {
        activeLongPressContextUser = null;
    }
});

// --- 6. SOCKET CLUSTER HANDLING SYSTEMS ---
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

// --- 7. INTEGRATED VIEWPORT CORE INTERACTION ENGINE ---
async function joinActiveChannel(roomCode, roomName) {
    currentRoomCode = roomCode;
    UI.openSidebarBtn.style.display = "none";
    DOM.mainAppHeader.classList.add('hidden');
    DOM.feedView.classList.add('hidden');
    DOM.chatView.classList.remove('hidden');
    DOM.currentRoomTitle.innerText = roomName || `Room: ${roomCode}`;
    DOM.messagesContainer.innerHTML = '';

    if (roomCode.startsWith('dm_')) {
        document.getElementById('leave-group-btn').style.display = "none";
    } else {
        document.getElementById('leave-group-btn').style.display = "block";
    }

    try {
        const response = await fetch(`${SERVER_URL}/api/rooms/${roomCode}/messages`);
        if (response.ok) {
            const dailyLogsHistory = await response.json();
            dailyLogsHistory.forEach(msg => {
                displayMessage({ id: msg._id, sender: msg.sender, senderSig: msg.senderSig, text: msg.text, type: msg.type });
            });
        }
    } catch (err) {
        console.warn(err.message);
    }
    if (socket) {
        socket.emit('join-room', { roomCode: currentRoomCode, userAlias: currentUser.alias });
    }
}

function displayMessage(msg) {
    const isMe = (msg.senderSig === getOrCreateFingerprintToken() || msg.sender === currentUser.alias);
    const msgWrapper = document.createElement('div');
    msgWrapper.className = `msg-wrapper ${isMe ? 'outgoing' : 'incoming'}`;
    msgWrapper.id = msg.id;

    let bubbleContent = '';
    if (msg.type === 'image') {
        bubbleContent = `<img src="${msg.text}" class="msg-media image-message" alt="Attachment" style="display: block; max-width: 100%; height: auto; border-radius: 8px;">`;
    } else {
        bubbleContent = linkifyText(msg.text);
    }

    msgWrapper.innerHTML = `
        <div class="msg-meta" data-sig="${msg.senderSig}" data-name="${msg.sender}">
            ${isMe ? 'You (' + msg.sender + ')' : msg.sender}
        </div>
        <div class="msg-bubble">${bubbleContent}</div>
    `;

    const metaNode = msgWrapper.querySelector('.msg-meta');
    registerLongPressUserMeta(metaNode, msg.senderSig, msg.sender);

    if (isMe) {
        let burnTimer = null;
        const startChargingBurn = (e) => {
            if (e.type === 'touchstart') e.preventDefault();
            msgWrapper.classList.add('charging');
            burnTimer = setTimeout(() => {
                if (socket && currentRoomCode) {
                    socket.emit('delete-message', { roomCode: currentRoomCode, messageId: msg.id });
                }
                clearChargingBurn();
            }, 1000);
        };
        const clearChargingBurn = () => {
            msgWrapper.classList.remove('charging');
            if (burnTimer) { clearTimeout(burnTimer); burnTimer = null; }
        };
        msgWrapper.addEventListener('mousedown', startChargingBurn);
        msgWrapper.addEventListener('mouseup', clearChargingBurn);
        msgWrapper.addEventListener('mouseleave', clearChargingBurn);
        msgWrapper.addEventListener('touchstart', startChargingBurn, { passive: false });
        msgWrapper.addEventListener('touchend', clearChargingBurn);
    }
    DOM.messagesContainer.appendChild(msgWrapper);
    DOM.messagesContainer.scrollTop = DOM.messagesContainer.scrollHeight;
}

DOM.leaveChatBtn.addEventListener('click', () => {
    DOM.chatView.classList.add('hidden');
    DOM.feedView.classList.remove('hidden');
    DOM.mainAppHeader.classList.remove('hidden');
    if (currentActiveViewTab === "groups") {
        UI.openSidebarBtn.style.display = "flex";
    }
    currentRoomCode = null;
    renderPersistentRoomTabs();
});

// --- 8. SYSTEM BURN RESET WARNING TICKER ---
function checkSystemMeltdownWarning() {
    if (IS_DEV_MODE) return;
    const now = new Date();
    if (now.getHours() === 3 && now.getMinutes() >= 55) {
        const secondsLeft = 60 - now.getSeconds() + ((59 - now.getMinutes()) * 60);
        let countdownOverlay = document.getElementById('meltdown-alert-banner');
        if (!countdownOverlay) {
            countdownOverlay = document.createElement('div');
            countdownOverlay.id = 'meltdown-alert-banner';
            countdownOverlay.style = "position: fixed; top: 90px; left: 0; width: 100%; background: #FF3B30; color: #fff; text-align: center; padding: 10px; font-weight: 800; font-size: 0.9rem; z-index: 9999; letter-spacing: 0.05em; text-transform: uppercase; box-shadow: 0 4px 12px rgba(255,59,48,0.3);";
            document.body.appendChild(countdownOverlay);
        }
        countdownOverlay.innerText = `🚨 WARNING: Data purge in ${secondsLeft}s. Connections burn at dawn!`;
    } else {
        const activeBanner = document.getElementById('meltdown-alert-banner');
        if (activeBanner) activeBanner.remove();
    }
}

// --- 9. AUXILIARY MODAL FLOW MANAGERS ---
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

DOM.openModalBtn.addEventListener('click', () => { resetModalLayout(); DOM.customModal.classList.remove('hidden'); });
DOM.modalCancel.addEventListener('click', () => DOM.customModal.classList.add('hidden'));
DOM.modalInput.addEventListener('input', () => DOM.modalErrorText.classList.add('hidden'));
UI.splashClose.addEventListener('click', () => UI.splashModal.classList.add('hidden'));

DOM.choiceCreateBtn.addEventListener('click', () => {
    currentModalState = 'create-input'; DOM.modalTitle.innerText = "Create Group Channel";
    DOM.choiceView.classList.add('hidden'); DOM.modalInput.classList.remove('hidden');
    DOM.modalConfirm.classList.remove('hidden'); DOM.modalInput.placeholder = "Room Name";
    DOM.modalInput.maxLength = 20; DOM.modalInput.focus();
});

DOM.choiceJoinBtn.addEventListener('click', () => {
    currentModalState = 'join-input'; DOM.modalTitle.innerText = "Join Group Channel";
    DOM.choiceView.classList.add('hidden'); DOM.modalInput.classList.remove('hidden');
    DOM.modalConfirm.classList.remove('hidden'); DOM.modalInput.placeholder = "Enter 6-Digit Code";
    DOM.modalInput.maxLength = 6; DOM.modalInput.focus();
});

DOM.modalConfirm.addEventListener('click', async () => {
    const rawVal = DOM.modalInput.value.trim();
    if (currentModalState === 'create-input') {
        if (!rawVal) return;
        try {
            const response = await fetch(`${SERVER_URL}/api/create-room`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ roomName: rawVal }) });
            const data = await response.json();
            if (!response.ok) throw new Error(data.error);
            currentModalState = 'success';
            DOM.modalTitle.innerText = `Group Created: ${data.roomName}`;
            DOM.modalInput.classList.add('hidden'); DOM.successView.classList.remove('hidden');
            DOM.generatedCodeDisplay.innerText = data.roomCode; DOM.modalConfirm.innerText = "Enter Room";
            saveChannelToPersistence(data.roomCode, data.roomName, false);
            DOM.copyCodeBtn.onclick = () => {
                navigator.clipboard.writeText(data.roomCode); DOM.copyCodeBtn.innerText = "Copied!";
                setTimeout(() => { DOM.copyCodeBtn.innerText = "Copy Code"; }, 2000);
            };
        } catch (err) {
            DOM.modalErrorText.innerText = err.message || "Failed to create channel."; DOM.modalErrorText.classList.remove('hidden');
        }
    }
    else if (currentModalState === 'join-input') {
        if (!/^\d{6}$/.test(rawVal)) { DOM.modalErrorText.innerText = "Invalid Code !!"; DOM.modalErrorText.classList.remove('hidden'); return; }
        try {
            const clientSig = getOrCreateFingerprintToken();
            const response = await fetch(`${SERVER_URL}/api/verify-room/${rawVal}?sig=${clientSig}`);
            const data = await response.json();
            if (!data.allowed) { DOM.modalErrorText.innerText = data.error || "Invalid Code !!"; DOM.modalErrorText.classList.remove('hidden'); return; }
            saveChannelToPersistence(data.roomCode, data.roomName, false);
            DOM.customModal.classList.add('hidden'); joinActiveChannel(data.roomCode, data.roomName);
        } catch (err) {
            DOM.modalErrorText.innerText = "Invalid Code !!"; DOM.modalErrorText.classList.remove('hidden');
        }
    }
    else if (currentModalState === 'success') {
        const activeCode = DOM.generatedCodeDisplay.innerText;
        let savedRooms = JSON.parse(localStorage.getItem('curfew_rooms_map')) || {};
        DOM.customModal.classList.add('hidden'); joinActiveChannel(activeCode, savedRooms[activeCode]);
    }
});

const leaveModal = document.getElementById('leave-confirm-modal');
document.getElementById('leave-group-btn').addEventListener('click', () => { if (!currentRoomCode) return; leaveModal.classList.remove('hidden'); });
document.getElementById('leave-modal-cancel').addEventListener('click', () => leaveModal.classList.add('hidden'));
document.getElementById('leave-modal-confirm').addEventListener('click', () => {
    leaveModal.classList.add('hidden');
    let savedRooms = JSON.parse(localStorage.getItem('curfew_rooms_map')) || {};
    delete savedRooms[currentRoomCode];
    localStorage.setItem('curfew_rooms_map', JSON.stringify(savedRooms));
    DOM.chatView.classList.add('hidden'); DOM.feedView.classList.remove('hidden'); DOM.mainAppHeader.classList.remove('hidden');
    currentRoomCode = null; renderPersistentRoomTabs();
});

// --- 10. INPUT TRANSMISSIONS AND CANVAS SECURITY ---
function linkifyText(text) {
    const urlPattern = /(\b(https?|ftp|file):\/\/[-A-Z0-9+&@#\/%?=~_|!:,.;]*[-A-Z0-9+&@#\/%=~_|])/ig;
    return text.replace(urlPattern, '<a href="$1" target="_blank" class="msg-link">$1</a>');
}

function dispatchOutgoingMessage() {
    const text = DOM.chatInput.value.trim();
    if (!text || !currentRoomCode) return;
    const clientSig = getOrCreateFingerprintToken();
    socket.emit('send-message', { roomCode: currentRoomCode, sender: currentUser.alias, senderSig: clientSig, text: text, type: 'text' });
    DOM.chatInput.value = '';
}

DOM.attachBtn.addEventListener('click', () => DOM.fileInput.click());
DOM.fileInput.addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (!file || !currentRoomCode) return;
    if (file.type.startsWith('image/')) {
        const reader = new FileReader();
        reader.onload = function (event) {
            const clientSig = getOrCreateFingerprintToken();
            socket.emit('send-message', { roomCode: currentRoomCode, sender: currentUser.alias, senderSig: clientSig, text: event.target.result, type: 'image' });
        };
        reader.readAsDataURL(file);
    }
    DOM.fileInput.value = '';
});

window.addEventListener('blur', () => {
    if (IS_DEV_MODE) return;
    const overlay = document.querySelector('.screenshot-overlay');
    if (overlay && !DOM.chatView.classList.contains('hidden')) { overlay.style.display = 'flex'; DOM.messagesContainer.classList.add('frozen-lockdown'); }
});
window.addEventListener('focus', () => {
    if (IS_DEV_MODE) return;
    const overlay = document.querySelector('.screenshot-overlay');
    if (overlay) { overlay.style.display = 'none'; DOM.messagesContainer.classList.remove('frozen-lockdown'); }
});
window.addEventListener('keydown', (e) => {
    if (IS_DEV_MODE) return;
    if ((e.metaKey && e.shiftKey) || (e.ctrlKey && e.shiftKey) || e.key === 'PrintScreen') {
        const stream = DOM.messagesContainer; stream.style.filter = 'blur(40px)';
        setTimeout(() => { stream.style.filter = 'none'; }, 2000);
    }
});

function initializeApplicationTheme() {
    const savedTheme = localStorage.getItem('curfew_visual_theme');
    if (savedTheme === 'light') { document.body.classList.add('light-theme'); DOM.themeToggleCheckbox.checked = false; }
    else { document.body.classList.remove('light-theme'); DOM.themeToggleCheckbox.checked = true; }
}
DOM.themeToggleCheckbox.addEventListener('change', () => {
    if (DOM.themeToggleCheckbox.checked) { document.body.classList.remove('light-theme'); localStorage.setItem('curfew_visual_theme', 'dark'); }
    else { document.body.classList.add('light-theme'); localStorage.setItem('curfew_visual_theme', 'light'); }
});

DOM.sendBtn.addEventListener('click', dispatchOutgoingMessage);
DOM.chatInput.addEventListener('keypress', (e) => { if (e.key === 'Enter') dispatchOutgoingMessage(); });

initializeApplicationTheme();
setInterval(() => { monitorCurfew(); checkSystemMeltdownWarning(); }, 1000);
monitorCurfew();