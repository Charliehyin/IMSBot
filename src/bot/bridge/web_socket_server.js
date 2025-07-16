const WebSocket = require('ws');
const EventEmitter = require('events');
const { loadMemberData } = require('../utils/dataUtils');

class WebSocketServer extends EventEmitter {
    constructor(port) {
        super();
        this.port = port;
        this.wss = new WebSocket.Server({ port });
        this.authenticatedSockets = new Map(); // Map of ws -> user data
        this.lastGuildMsgs = [];
        this.validKeys = new Map(); // Map of generated_uuid -> user data

        this.loadValidKeys();
        this.setupEventHandlers();
        console.log(`[WebSocket] Server started on port ${port}`);

        // Additional setup (connection handling, auth, message routing) goes here
        // ...
    }

    /**
     * Loads valid keys from the members table into memory.
     */
    async loadValidKeys() {
        const members = await loadMemberData();
        for (const uuid in members) {
            this.validKeys.set(uuid, members[uuid]);
        }
    }

    /**
     * Sets up WebSocket event handlers for authentication and messaging.
     */
    setupEventHandlers() {
        this.wss.on('connection', ws => {
            ws.on('message', msg => this.handleIncoming(ws, msg));
            ws.on('close', () => this.handleDisconnect(ws));
        });
    }

    async handleIncoming(ws, raw) {
        let data;
        try { data = JSON.parse(raw); } catch {
            return ws.send(JSON.stringify({ error: 'Invalid JSON' }));
        }

        if (data.type === 'auth') {
            const user = this.validKeys.get(data.key);
            if (!user) {
                return ws.send(JSON.stringify({ type: 'auth', success: false }));
            }
            this.authenticatedSockets.set(ws, user);
            ws.send(JSON.stringify({ type: 'auth', success: true }));
            this.emit('clientAuthenticated', user);
            return;
        }

        if (!this.authenticatedSockets.has(ws)) {
            return ws.send(JSON.stringify({ error: 'Not authenticated' }));
        }

        if (data.type === 'chat') {
            const userData = this.authenticatedSockets.get(ws);
            this.emit('minecraftMessage', {
                guild: userData.guild_name,
                player: userData.ign,
                message: data.msg
            });
        }
    }

    handleDisconnect(ws) {
        this.authenticatedSockets.delete(ws);
    }

    /**
     * Returns counts of connected clients per guild or total.
     */
    getConnectedClientsByGuild() {
        const guildCounts = {};
        this.authenticatedSockets.forEach(userData => {
            const g = userData.guild_name;
            guildCounts[g] = (guildCounts[g] || 0) + 1;
        });
        return guildCounts;
    }

    getConnectedClients() {
        return Array.from(this.authenticatedSockets).length;
    }

    async reloadValidKeys() {
        await this.loadValidKeys();
    }
}

module.exports = WebSocketServer;
