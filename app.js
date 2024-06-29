require('dotenv').config();
const express = require('express');
const { Client, GatewayIntentBits, REST, Routes, SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const mysql = require('mysql2/promise');
const { process_moderationapi_message } = require('./src/bot/moderationApi');
const { setup_interaction, view_tracks_interaction, delete_track_interaction } = require('./src/bot/commands/oldCommands');
const { setup_command, view_tracks_command, delete_track_command } = require('./src/bot/commands/oldCommands');

// Create a new client instance
const client = new Client({ intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent, GatewayIntentBits.DirectMessages] });

// Database connection
const db = mysql.createPool({
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME
});

// When the client is ready, run this code
client.once('ready', () => {
    console.log(`Logged in as ${client.user.tag}!`);
    registerSlashCommands();
});

// Slash command registration
async function registerSlashCommands() {
    const commands = [
        // setup_command, 
        // view_tracks_command,
        // delete_track_command
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
        console.error(error);
    }
}

client.on('interactionCreate', async interaction => {
    if (!interaction.isChatInputCommand()) return;

    const { commandName } = interaction;

    if (commandName === 'setup') {
        setup_interaction(interaction, db);
    }
    if (commandName === 'view_tracks') {
        view_tracks_interaction(interaction, db);
    }
    if (commandName === 'delete_track') {
        delete_track_interaction(interaction, db);
    }
});

// Commands for testing notifications
client.on('messageCreate', async message => {

    const channel = await client.channels.fetch('1256290890432122921');

    // Ignore messages from bots
    if (message.author.bot) return;

    try {
        // add messages in #general to messages
        if (message.channel.id === '846532502125936651') {
            const [result] = await db.query('INSERT INTO normal_messages (senderid, message, time_stamp) VALUES (?, ?, ?)', [message.author.id, message.content, new Date(message.createdTimestamp).toLocaleString() + ' CDT']);
        }

        // add messages in #bot-testing-ground to porn_messages
        if (message.channel.id === '1256290890432122921') {
            const [result] = await db.query('INSERT INTO porn_messages (senderid, message, time_stamp) VALUES (?, ?, ?)', [message.author.id, message.content, new Date(message.createdTimestamp).toLocaleString() + ' CDT']);
        }

        await process_moderationapi_message(message, "https://api.openai.com/v1/moderations", channel, client);
    } catch (error) {
        console.error(error);
    }
});

// Login to Discord with your app's token
client.login(process.env.DISCORD_TOKEN);

// Health check server
const app = express();

app.get('/health', (req, res) => {
    res.send('OK');
});

const PORT = process.env.PORT || 8080;
app.listen(PORT, () => {
    console.log(`Health check server running on port ${PORT}`);
});
