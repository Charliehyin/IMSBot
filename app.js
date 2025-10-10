require('dotenv').config();
const { Client, GatewayIntentBits, REST, Routes } = require('discord.js');
const mysql = require('mysql2/promise');
const { botStatus } = require('./src/bot/botStatus');

const { process_moderationapi_message } = require('./src/bot/moderationApi');
const { 
    verify_command,
    verify_interaction,
    help_verify_command,
    help_verify_interaction,
    setup_verify_command,
    setup_verify_interaction,
    verify_button_interaction,
    help_button_interaction
} = require('./src/bot/commands/verify');
const { WebSocketServer }  = require('./src/bot/bridge/web_socket_server');
const { DiscordHandler }   = require('./src/bot/bridge/discord_handler');
const { update_online_player_counts }   = require('./src/bot/bridge/bridge_counter');
const { sync_roles_command, sync_roles_interaction } = require('./src/bot/commands/sync_roles');
const { 
    guild_id, 
    automod_channel, 
    general_channel,
    WS_PORT
} = require('./src/bot/constants');
const { blacklist_command, blacklist_interaction } = require('./src/bot/commands/blacklist');
const { get_uuid_command, get_uuid_interaction } = require('./src/bot/commands/get_uuid');
const { punishments_command, punishments_interaction } = require('./src/bot/commands/punishments');
const { 
    setup_apply_command, 
    setup_apply_interaction,
    handle_guild_selection,
    handle_guild_accept,
    handle_guild_reject,
    handle_application_close,
    handle_guild_invited,
    handle_guild_ask_to_leave,
    handle_guild_notify_invited
} = require('./src/bot/commands/guild_apply');
const { skycrypt_command, skycrypt_interaction } = require('./src/bot/commands/skycrypt');
const { mute_command, restrict_command, ban_command, unban_command, ban_interaction, unban_interaction, punish_interaction, checkExpiredPunishments } = require('./src/bot/commands/mute_restrict_ban');
const { autosync_roles_all_guilds } = require('./src/bot/commands/autosync_roles');
const { fetch_guild_data, rank_guild_command, rank_guild_interaction } = require('./src/bot/commands/rank_guild');
const { check_garden_command, check_garden_interaction } = require('./src/bot/commands/check_garden');
const { track_user_command, track_user_interaction, process_active_tracking_sessions, stop_all_tracking } = require('./src/bot/commands/track_user');
const { bridge_key_command, deactivate_bridge_key_command, bridgekey_interaction, deactivate_interaction } = require('./src/bot/commands/bridge_commands');
// Create a new client instance
const client = new Client({ 
    intents: [
        GatewayIntentBits.Guilds, 
        GatewayIntentBits.GuildMessages, 
        GatewayIntentBits.MessageContent, 
        GatewayIntentBits.DirectMessages
    ] 
});

// Database connection
const db = mysql.createPool({
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME
});

// When the client is ready, run this code
client.once('ready', async () => {
    console.log(`Logged in as ${client.user.tag}!`);
    botStatus.isRunning = true; // Set bot status to running
    // fetch_guild_data(client, db);
    checkExpiredPunishments(client, db);
    // autosync_roles_all_guilds(client, db);
    setInterval(async () => {
        checkExpiredPunishments(client, db);
    }, 15000); // Check every 15 seconds
    setInterval(async () => {
        autosync_roles_all_guilds(client, db);
    }, 3 * 60 * 60 * 1000); // Check every 3 hours
    setInterval(async () => {
        fetch_guild_data(client, db);
    }, 60 * 60 * 1000); // Check every 60 minutes
    setInterval(async () => {
        process_active_tracking_sessions(client, db);
    }, 5 * 60 * 1000); // Check tracking sessions every 5 minutes
    
    // Bridge Websocket Start
    const wsServer = new WebSocketServer({ port: WS_PORT || 3000, db, client });
    client.wsServer = wsServer;
    new DiscordHandler(client, wsServer);  
    setInterval(async () => {
        update_online_player_counts(client, wsServer);
    }, 5 * 60 * 1000); // Check number of active websocket connections for each guild every 5 mins
    // Bridge End
    await registerSlashCommands();
});

// Slash command registration
async function registerSlashCommands() {
    const commands = [
        verify_command,
        sync_roles_command,
        blacklist_command,
        get_uuid_command,
        punishments_command,
        setup_apply_command,
        setup_verify_command,
        help_verify_command,
        skycrypt_command,
        mute_command,
        restrict_command,
        ban_command,
        unban_command,
        rank_guild_command,
        check_garden_command,
        track_user_command,
        bridge_key_command,
        deactivate_bridge_key_command
    ].map(command => command.toJSON());

    const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_TOKEN);

    try {
        console.log('Started refreshing application (/) commands.');

        await rest.put(
            Routes.applicationCommands(client.user.id),
            { body: commands }
        );

        console.log('Successfully reloaded application (/) commands.');
    } catch (error) {
        console.error('Error reloading application (/) commands:', error);
    }
}

client.on('interactionCreate', async interaction => {
    if (interaction.isChatInputCommand()) {
        switch (interaction.commandName) {
            case 'verify':
                await verify_interaction(interaction, db);
                break;
            case 'sync-roles':
                await sync_roles_interaction(interaction, db);
                break;
            case 'blacklist':
                await blacklist_interaction(interaction, db);
                break;
            case 'get_uuid':
                await get_uuid_interaction(interaction, db);
                break;
            case 'punishments':
                await punishments_interaction(interaction, db, null);
                break;
            case 'setup_apply':
                await setup_apply_interaction(interaction);
                break;
            case 'setup_verify':
                await setup_verify_interaction(interaction);
                break;
            case 'help_verify':
                await help_verify_interaction(interaction);
                break;
            case 'skycrypt':
                await skycrypt_interaction(interaction, db);
                break;
            case 'mute':
                await punish_interaction(interaction, db, 'mute');
                break;
            case 'restrict':
                await punish_interaction(interaction, db);
                break;
            case 'ban':
                await ban_interaction(interaction, db);
                break;
            case 'unban':
                await unban_interaction(interaction, db);
                break;
            case 'rank_guild':
                await rank_guild_interaction(interaction, db);
                break;
            case 'check_garden':
                await check_garden_interaction(interaction, db);
                break;
            case 'track_user':
                await track_user_interaction(interaction, db, client);
                break;
            case 'bridgekey':
                await bridgekey_interaction(interaction);
                break;
            case 'deactivate':
                await deactivate_interaction(interaction);
                break;
        }
    } 
    else if (interaction.isButton()) {
        if (interaction.customId.startsWith('apply_')) {
            await handle_guild_selection(interaction, db, client);
        } else {
            switch (interaction.customId) {
                case 'guild_accept':
                    await handle_guild_accept(interaction, db, client);
                    break;
                case 'guild_reject':
                    await handle_guild_reject(interaction, db, client);
                    break;
                case 'application_close':
                    await handle_application_close(interaction, db, client);
                    break;
                case 'guild_invited':
                    await handle_guild_invited(interaction, db, client);
                    break;
                case 'guild_ask_to_leave':
                    await handle_guild_ask_to_leave(interaction, db, client);
                    break;
                case 'guild_notify_invited':
                    await handle_guild_notify_invited(interaction, db, client);
                    break;
                case 'verify_button':
                    await verify_button_interaction(interaction, db);
                    break;
                case 'verify_help':
                    await help_button_interaction(interaction);
                    break;
            }
        }
    } 
    else if (interaction.isModalSubmit()) {
        switch(interaction.customId) {
            case 'verification_form':
                await verify_interaction(interaction, db, { 'ign': interaction.fields.getTextInputValue('ign_input') });
                break;
        }
    }
});

// When a message is created
client.on('messageCreate', async message => {
    // Ignore messages not in IMS
    // if (message.guild.id !== guild_id) return;
    
    const channel = await client.channels.fetch(automod_channel);

    // Ignore messages from bots
    if (message.author.bot) return;

    const roleId = '886038506659545121';
    const channelId = '973254960479350794';

    // flawless gem 
    if (message.content === '?flawlessgem' && message.channel.id === channelId) {
        try {
            const member = await message.guild.members.fetch(message.author.id);
            if (member.roles.cache.has(roleId)) {
                message.channel.send('<@&879024853208924210>');
            } else {
                message.channel.send('You do not have the required role to use this command.');
            }
        } catch (error) {
            console.error('Error fetching member:', error);
            message.channel.send('An error occurred while checking your roles.');
        }
    }

    // Message logging in RDS
    // try {
    //     // Add messages in #general to normal_messages
    //     if (message.channel.id === general_channel) {
    //         await db.query('INSERT INTO normal_messages (senderid, message, time_stamp) VALUES (?, ?, ?)', [message.author.id, message.content, new Date(message.createdTimestamp).toLocaleString() + ' CDT']);
    //     }

    //     botStatus.rdsWorking = true;
    // } catch (error) {
    //     console.error('Error adding message to RDS:', error);
    //     botStatus.rdsWorking = false;
    // }

    // Automod messages using OpenAI Moderation API
    try {
        await process_moderationapi_message(message, "https://api.openai.com/v1/moderations", channel, client);
        botStatus.apiWorking = true;
    } catch (error) {
        console.error('Error processing message:', error);
        botStatus.apiWorking = false;
    }
});

// Login to Discord with your app's token
client.login(process.env.DISCORD_TOKEN).catch(error => {
    console.error('Error logging in to Discord:', error);
    botStatus.isRunning = false; // Set bot status to not running if login fails
});
