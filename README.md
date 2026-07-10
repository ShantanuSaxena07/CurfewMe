# curfew. 🤫

A production-grade, ultra-minimalist, ephemeral group chatting application engineered with absolute privacy and structural scarcity. 

**"SARE SABOOT KHATAM."**

---

## ⚡ The Architectural Concept
`curfew.` is designed around engineered scarcity. The platform completely alters its state depending on the time of day:
*   **The Night Window (7:00 PM – 4:00 AM):** The system comes completely live. Users are assigned a dynamic, non-persistent, pop-culture alias and a matching iconic quote via the Google Gemini API. Group channels can be generated or accessed using unique 6-digit channel tokens.
*   **The Daylight Lockout (4:01 AM – 6:59 PM):** The application interface locks down completely, displaying an elegant minimalist live countdown timer ticking down to the next evening.
*   **The 4:00 AM Purge:** At exactly 04:00:00 AM server-time, an automated background execution job fires, instantly flushing all live chat logs, images, and streaming video binaries directly out of volatile server RAM memory. No hard-drive traces or tracking footprints remain.

## 🛡️ Built-in Security Safeguards
1.  **Client-Server Decoupling:** Secure architectural isolation. Hidden API keys and internal validation parameters reside completely hidden on the cloud backend, ensuring zero exposure to public inspect panels or repository lookups.
2.  **In-Memory Lifecycle Handling:** Live communications stay mapped entirely inside server RAM memory objects instead of persistent long-form databases, eliminating physical data footprints.
3.  **Synchronized Dynamic Deletions:** Single-bubble manual hold events emit instant server-wide WebSocket purges, burning targeted elements from all connected screens simultaneously via a custom CSS ash-and-smoke particle decay.
4.  **Anti-Leak Screenshot Protections:** The UI captures browser blur/focus anomalies to trigger a full-canvas visual shield layer. Keyboard triggers associated with native screen capture shortkeys trigger an instantaneous 40px graphical blur filter across active streams.

## 🛠️ The Technology Stack
*   **Frontend Agent:** Semantic HTML5, Minimalist CSS3 Typography Layouts, Vanilla JavaScript (ES6+).
*   **Backend Runtime:** Node.js, Express Framework.
*   **Real-time Engine:** Socket.io (WebSocket duplex communication pipeline).
*   **Cognitive Intelligence:** Google Gemini API (`gemini-2.5-flash` model endpoint).

---

## 🚀 Local Installation & Deployment

### Prerequisite Dependencies
Ensure you have [Node.js (LTS)](https://nodejs.org/) installed.

### 1. Backend Server Environment Configuration
Navigate to the server workspace directory and install core modules:
```bash
cd curfew-app/backend
npm install