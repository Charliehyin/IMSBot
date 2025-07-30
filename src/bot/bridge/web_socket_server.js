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
                ) AS latest ON latest.user_id = m.uuid
            `);
            if (!rows.length) {
                return;
            }

            this.validKeys.clear();
            for (const { bridge_key, minecraft_name, guild_id } of rows) {
                const guild_name = GUILD_NAME_MAP[guild_id] || guild_id;
                this.validKeys.set(bridge_key, { minecraft_name, guild_name });
            }
        } catch (err) {
            console.error('[Auth] Error loading valid keys:', err);
        }
    }

    // Registers handlers for new connections and their messages
    setup_event_handlers() {
        this.wss.on('connection', ws => {
            const authTimeout = setTimeout(() => {
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
        try {
            obj = JSON.parse(data);
        } catch {
            return ws.close(1008, 'Bad JSON');
        }

        if (obj.from !== 'mc' || typeof obj.key !== 'string') {
            return ws.close(1008, 'Bad auth format');
        }

        const user = this.validKeys.get(obj.key);
        if (!user) {
            ws.send(JSON.stringify({ from:'server', type:'auth_failed', message:'Invalid bridge key' }));
            return ws.close(1008, 'Invalid bridge key');
        }

        clearTimeout(ws.authTimeout);

        for (const [otherWs, otherUser] of this.authenticatedSockets) {
            if (otherUser.key === obj.key) {
            otherWs.send(JSON.stringify({
                from: 'server',
                type: 'connection_replaced',
                message: 'Another client took over this key.'
            }));
            otherWs.close(1000, 'Replaced by new connection');
            this.authenticatedSockets.delete(otherWs);
            }
        }

        ws.bridgeKey = obj.key;
        this.authenticatedSockets.set(ws, {
            minecraft_name: user.minecraft_name,
            guild_name:    user.guild_name,
            key:           obj.key
        });

        console.log(`[Auth] Auth success: ${user.minecraft_name} from ${user.guild_name}`);
        ws.send(JSON.stringify({
            from: 'server',
            type: 'auth_success',
            message: 'Authenticated'
        }));
        this.emit('clientConnected', this.authenticatedSockets.size);
    }

    // Processes subsequent Minecraft messages after auth
    handle_minecraft_message(ws, data) {
        let obj;
        try { obj = JSON.parse(data); } catch (e) {
            return;
        }
        const user = this.authenticatedSockets.get(ws);
        if (obj.request) {
            this.handle_client_command_request(obj, user)
            return;
        }
        if (obj.from === 'mc' && obj.msg && this.is_unique_guild_msg(obj.msg) && !obj.combinedbridge) {
            const cleaned = this.clean_message(obj.msg);
            this.emit('minecraftMessage', { message: cleaned, guild: user.guild_name, player: user.minecraft_name });
        } else if (obj.combinedbridge == true && obj.msg){
                this.emit('minecraftBounce', {
                    msg: obj.msg,
                    player: user.minecraft_name,
                    combinedbridge: true,
                    guild: user.guild_name
                });
                this.emit('minecraftMessage', {
                    message: obj.msg,
                    player: user.minecraft_name,
                    combinedbridge: true,
                    guild: user.guild_name
                })
        }
    }

    handle_client_command_request(obj, user) {
        const request = obj.request
        let response = {}
        switch (request) {
            case 'getOnlinePlayers':
                response = this.get_connected_players_by_guild()
                break;
            default:
                console.warn(`[ClientRequest] Unknown request: ${request}`);
        }
        try {
            const responseMessage = {
                    request: request,
                    response: response
                }
            this.send_to_minecraft(responseMessage, null, user.minecraft_name);
        } catch (err) {
            console.error('[ClientRequest]: ', err);
        }
    }

    handle_disconnect(ws) {
        if (ws.authTimeout) {
            clearTimeout(ws.authTimeout);
        }
        if(this.authenticatedSockets.has(ws)) {
            this.authenticatedSockets.delete(ws);
            this.emit('clientDisconnected', this.authenticatedSockets.size);
        } else {
            console.log('[WS] Unauthenticated client disconnected');
        }
    }

    handle_error(ws, error) {
        console.error('[WS] WebSocket error:', error);
        if (ws.authTimeout) clearTimeout(ws.authTimeout);
        if (this.authenticatedSockets.has(ws)) {
            this.authenticatedSockets.delete(ws);
            this.emit('clientDisconnected', this.authenticatedSockets.size);
        }
    }

    // Removes duplicates and old messages for guild chat
    is_unique_guild_msg(msg) {
        const key = this.clean_message(msg).replace(/\s+/g, ' ').toLowerCase();
        if (this.lastGuildMsgs.includes(key)) return false;
        this.lastGuildMsgs.push(key);
        if (this.lastGuildMsgs.length > 100) this.lastGuildMsgs.shift();
        return true;
    }

    // Helper to strip formatting codes from messages
    clean_message(msg) {
        return msg.replace(/\[[^\]]+\]\s*/g, '') // remove [RANK], [DIVINE], etc.
                .replace(/§\w/g, '') // remove formatting codes
                .replace(/^Guild\s?>?\s?/, '') // remove "Guild > "
                .replace(/[♲⚒♻️♾️✨★☆♠♣♥♦✓✔︎•·●○◉◎★☆¤§©®™✓☑️❌➤➔→←↑↓↔↕]/g, '')
                .trim();
    }

    // Broadcasts a message to Minecraft clients, optionally by guild
    send_to_minecraft(message, targetGuild = null, targetPlayer = null) {
        const payload = JSON.stringify(message);
        this.authenticatedSockets.forEach((user, sock) => {
            if (sock.readyState === WebSocket.OPEN && (!targetGuild || user.guild_name === targetGuild)&& (targetPlayer === null || user.minecraft_name === targetPlayer)) {
                sock.send(payload);
            }
        });
    }

    send_online_players(obj, user) {
        const onlinePlayers = this.getConnectedClientsByGuild()[1];
        
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
        counts['COMBINED'] = this.authenticatedSockets.size;
        return counts;
    }

    
    // Returns counts of players per guild
    get_connected_players_by_guild() {
        const guilds = ["Ironman Sweats", "Ironman Casuals", "Ironman Academy"];
        const playersByGuild = {};
        guilds.forEach(guild => {
            playersByGuild[guild] = [];
        });
        const displayNames = {
            IMS: 'Ironman Sweats',
            IMA: 'Ironman Academy',
            IMC: 'Ironman Casuals'
        };
        this.authenticatedSockets.forEach((user, sock) => {
            if (sock.readyState === WebSocket.OPEN) {
                const guild_name = displayNames[user.guild_name];
                playersByGuild[guild_name].push(user.minecraft_name);
            }
        });
        return playersByGuild;
    }

    // Public method to reload valid keys from DB
    async reload_valid_keys() {
        await this.load_valid_keys();
        
        for (const [ws] of this.authenticatedSockets) {
            if (!this.validKeys.has(ws.bridgeKey)) {
                // let the client know why…
                ws.send(JSON.stringify({
                    from: 'server',
                    type: 'auth_revoked',
                    message: 'Your bridge key has been revoked; disconnecting.'
                }));
                ws.close(1008, 'Key revoked');
            }
        }
    }
}

exports.WebSocketServer = WebSocketServer;