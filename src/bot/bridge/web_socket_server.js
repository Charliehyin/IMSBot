const WebSocket = require("ws");
const EventEmitter = require("events");
const {
  ims_guild_id,
  imc_guild_id,
  ima_guild_id
} = require('../constants');

// Maps Discord guild IDs to friendly names
const GUILD_NAME_MAP = {
  [ims_guild_id]: 'IMS',
  [imc_guild_id]: 'IMC',
  [ima_guild_id]: 'IMA'
};

class WebSocketServer extends EventEmitter {
    // Initializes WS server on given port with DB and Discord client
    constructor({ port, db, client }) {
        super();
        this.port = port;
        this.db = db;
        this.client = client;
        this.wss = new WebSocket.Server({ port });
        this.authenticatedSockets = new Map();  // Tracks authenticated clients
        this.lastGuildMsgs = [];              // For de-duping messages
        this.validKeys = new Map();           // Stores valid bridge keys

        this.load_valid_keys();       // Preload valid member keys
        this.setup_event_handlers();  // Listen for connections and messages
        console.log(`[WS] Server started on port ${port}`);
    }

    // Loads bridge keys and member info from DB into memory
    async load_valid_keys() {
        try {
            const [rows] = await this.db.execute(`
                SELECT m.bridge_key AS bridge_key,
                       m.ign AS minecraft_name,
                       latest.guild_id AS guild_id
                FROM members m
                INNER JOIN (
                    SELECT user_id, guild_id
                    FROM guild_member_data
                    WHERE (user_id, time_stamp) IN (
                        SELECT user_id, MAX(time_stamp)
                        FROM guild_member_data
                        GROUP BY user_id
                    )
                ) AS latest ON latest.user_id = m.discord_id
            `);
            if (!rows.length) {
                console.log(`[Auth] No guild members found`);
                return;
            }

            this.validKeys.clear();
            for (const { bridge_key, minecraft_name, guild_id } of rows) {
                const guild_name = GUILD_NAME_MAP[guild_id] || guild_id;
                this.validKeys.set(bridge_key, { minecraft_name, guild_name });
            }
            console.log(`[Auth] Loaded ${this.validKeys.size} valid bridge keys`);
        } catch (err) {
            console.error('[Auth] Error loading valid keys:', err);
        }
    }

    // Registers handlers for new connections and their messages
    setup_event_handlers() {
        this.wss.on('connection', ws => {
            console.log('[WS] Client connected, awaiting authentication…');
            const authTimeout = setTimeout(() => {
                console.log('[WS] Authentication timeout');
                ws.close(1008, 'Auth timeout');
            }, 10000);
            ws.authTimeout = authTimeout;

            ws.on('message', data => {
                if (!this.authenticatedSockets.has(ws)) {
                    this.handle_authentication(ws, data);
                } else {
                    this.handle_minecraft_message(ws, data);
                }
            });

            ws.on('close', () => this.handle_disconnect(ws));
            ws.on('error', err => this.handle_error(ws, err));
        });
    }

    // Authenticates client based on bridge key in first message
    handle_authentication(ws, data) {
        let obj;
        try { obj = JSON.parse(data); } catch (e) {
            console.log('[Auth] Invalid JSON during auth');
            ws.close(1008, 'Bad JSON');
            return;
        }
        if (obj.from === 'mc' && obj.key) {
            const user = this.validKeys.get(obj.key);
            if (user) {
                clearTimeout(ws.authTimeout);
                this.authenticatedSockets.set(ws, user);
                console.log(`[Auth] Auth success: ${user.minecraft_name} from ${user.guild_name}`);
                ws.send(JSON.stringify({ from: 'server', type: 'auth_success', message: 'Authenticated' }));
                this.emit('clientConnected', this.authenticatedSockets.size);
            } else {
                console.log(`[Auth] Invalid key: ${obj.key}`);
                ws.send(JSON.stringify({ from: 'server', type: 'auth_failed', message: 'Invalid key' }));
                ws.close(1008, 'Invalid key');
            }
        } else {
            console.log('[Auth] Improper auth format');
            ws.close(1008, 'Bad auth format');
        }
    }

    // Processes subsequent Minecraft messages after auth
    handle_minecraft_message(ws, data) {
        let obj;
        try { obj = JSON.parse(data); } catch (e) {
            console.log('[WS] Invalid JSON');
            return;
        }
        if (obj.from === 'mc' && obj.msg && this.is_unique_guild_msg(obj.msg)) {
            const user = this.authenticatedSockets.get(ws);
            const cleaned = this.clean_message(obj.msg);
            this.emit('minecraftMessage', { message: cleaned, guild: user.guild_name, player: user.minecraft_name });
        }
    }

    // Removes duplicates and old messages for guild chat
    is_unique_guild_msg(msg) {
        const key = this.clean_message(msg).toLowerCase();
        if (this.lastGuildMsgs.includes(key)) return false;
        this.lastGuildMsgs.push(key);
        if (this.lastGuildMsgs.length > 100) this.lastGuildMsgs.shift();
        return true;
    }

    // Helper to strip formatting codes from messages
    clean_message(msg) {
        return msg.replace(/\[[^\]]+\]\s*/g, '')
                  .replace(/§\w/g, '')
                  .replace(/^Guild\s?>?\s?/, '')
                  .replace(/[♲♻️♾️✨★☆♠♣♥♦✓✔︎•·●○◉◎★☆¤§©®™✓☑️❌➤➔→←↑↓↔↕]/g, '')
                  .trim();
    }

    // Broadcasts a message to Minecraft clients, optionally by guild
    send_to_minecraft(message, targetGuild = null) {
        const payload = JSON.stringify(message);
        this.authenticatedSockets.forEach((user, sock) => {
            if (sock.readyState === WebSocket.OPEN && (!targetGuild || user.guild_name === targetGuild)) {
                sock.send(payload);
            }
        });
    }

    // Returns current count of connected clients
    get_connected_clients() {
        return this.authenticatedSockets.size;
    }

    // Returns counts of clients per guild
    get_connected_clients_by_guild() {
        const counts = {};
        this.authenticatedSockets.forEach((user, sock) => {
            if (sock.readyState === WebSocket.OPEN) {
                counts[user.guild_name] = (counts[user.guild_name] || 0) + 1;
            }
        });
        return counts;
    }

    // Public method to reload valid keys from DB
    async reload_valid_keys() {
        await this.load_valid_keys();
    }
}

exports.WebSocketServer = WebSocketServer;
