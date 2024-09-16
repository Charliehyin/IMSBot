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
const { sync_roles_command, sync_roles_interaction } = require('./src/bot/commands/sync_roles');
const { automod_channel, general_channel } = require('./src/bot/constants');
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
const { mute_command, mute_interaction, checkExpiredMutes } = require('./src/bot/commands/mute');
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
    await checkExpiredMutes(client, db);
    setInterval(async () => {
        await checkExpiredMutes(client, db);
    }, 15000); // Check every 15 seconds
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
        mute_command
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
                await mute_interaction(interaction, db);
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
