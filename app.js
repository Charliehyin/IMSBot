require('dotenv').config();
const { Client, GatewayIntentBits, REST, Routes } = require('discord.js');
const mysql = require('mysql2/promise');
const { botStatus } = require('./src/bot/botStatus');

const { process_moderationapi_message } = require('./src/bot/moderationApi');
const { verify_command, verify_interaction } = require('./src/bot/commands/verify');
const { sync_roles_command, sync_roles_interaction } = require('./src/bot/commands/sync_roles');
const { automod_channel, general_channel } = require('./src/bot/constants');
const { blacklist_command, blacklist_interaction } = require('./src/bot/commands/blacklist');
const { get_uuid_command, get_uuid_interaction } = require('./src/bot/commands/get_uuid');
const { punishments_command, punishments_interaction } = require('./src/bot/commands/punishments');
const { 
    guild_apply_command, 
    guild_apply_interaction, 
    setup_apply_command, 
    setup_apply_interaction,
    handle_guild_selection,
    handle_guild_accept,
    handle_guild_reject,
    handle_guild_invited,
    handle_guild_ask_to_leave
} = require('./src/bot/commands/guild_apply');

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
        guild_apply_command,
        setup_apply_command
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
        const { commandName } = interaction;

        switch (commandName) {
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
                await punishments_interaction(interaction, db);
                break;
            case 'guild_apply':
                await guild_apply_interaction(interaction, db);
                break;
            case 'setup_apply':
                await setup_apply_interaction(interaction);
                break;
        }
    } else if (interaction.isButton()) {
        if (interaction.customId.startsWith('apply_')) {
            await handle_guild_selection(interaction, db, client);
        } else if (interaction.customId === 'guild_accept') {
            await handle_guild_accept(interaction, db, client);
        } else if (interaction.customId === 'guild_reject') {
            await handle_guild_reject(interaction, db, client);
        } else if (interaction.customId === 'guild_invited') {
            await handle_guild_invited(interaction, db, client);
        } else if (interaction.customId === 'guild_ask_to_leave') {
            await handle_guild_ask_to_leave(interaction, db, client);
        }
    }
});

// When a message is created
client.on('messageCreate', async message => {
    const channel = await client.channels.fetch(automod_channel);

    // Ignore messages from bots
    if (message.author.bot) return;

    if (message.content === '!status') {
        channel.send(`Bot status: ${JSON.stringify(botStatus)}`);
        return;
    }

    // Message logging in RDS
    try {
        // Add messages in #general to normal_messages
        if (message.channel.id === general_channel) {
            await db.query('INSERT INTO normal_messages (senderid, message, time_stamp) VALUES (?, ?, ?)', [message.author.id, message.content, new Date(message.createdTimestamp).toLocaleString() + ' CDT']);
        }

        botStatus.rdsWorking = true;
    } catch (error) {
        console.error('Error adding message to RDS:', error);
        botStatus.rdsWorking = false;
    }

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
