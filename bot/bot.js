require('dotenv').config();
const { Client, GatewayIntentBits, REST, Routes, SlashCommandBuilder } = require('discord.js');
const mysql = require('mysql2/promise');

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
        new SlashCommandBuilder()
            .setName('setup')
            .setDescription('Setup notifications')
            .addStringOption(option =>
                option.setName('user_id')
                    .setDescription('User ID to notify')
                    .setRequired(true))
            .addStringOption(option =>
                option.setName('notification_style')
                    .setDescription('Notification style')
                    .setRequired(true)
                    .addChoices(
                        { name: 'DM', value: 'DM' },
                        { name: 'Channel', value: 'Channel' }
                    ))
            .addStringOption(option =>
                option.setName('notification_channel')
                    .setDescription('Notification channel ID')
                    .setRequired(true))
            .addStringOption(option =>
                option.setName('search_mechanism')
                    .setDescription('Search mechanism')
                    .setRequired(true)
                    .addChoices(
                        { name: 'keyword', value: 'keyword' },
                        { name: 'ml', value: 'ml' },
                        { name: 'both', value: 'both'}
                    ))
            .addStringOption(option =>
                option.setName('keywords')
                    .setDescription('Keywords for the search')
                    .setRequired(true))
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
        const userId = interaction.options.getString('user_id');
        const notificationStyle = interaction.options.getString('notification_style');
        const notificationTo = interaction.options.getString('notification_channel');
        const searchMechanism = interaction.options.getString('search_mechanism');
        let keywords = interaction.options.getString('keywords');

        // parse keywords from comma separated string to array
        keywords = keywords.split(',').map(keyword => keyword.trim());

        // Store the setup information in the database
        try {
            // Insert into tracks
            const setterId = interaction.user.id;
            const [trackResult] = await db.query(`
                INSERT INTO tracks (setterid, targetid, notification_to, notification_style, search_mechanism)
                VALUES (?, ?, ?, ?, ?)
            `, [setterId, userId, notificationTo, notificationStyle, searchMechanism]);
            
            const trackId = trackResult.insertId;

            // Insert into track_key_words
            for (const keyword of keywords) {
                await db.query('INSERT INTO track_key_words (trackid, keyword) VALUES (?, ?)', [trackId, keyword]);
            }

            await interaction.reply(`Setup completed for user ID: ${userId} with notification style: ${notificationStyle}`);
        } catch (error) {
            console.error(error);
            await interaction.reply('There was an error setting up the notifications.');
        }
    }
});

// Commands for testing notifications
client.on('messageCreate', async message => {
    // Ignore messages from bots
    if (message.author.bot) return;

    // Check if the message came from a targetid
    try {
        const [rows] = await db.query('SELECT * FROM tracks WHERE targetid = ?', [message.author.id]);
        if (rows.length > 0) {
            for (const row of rows) {
                // Notify the user if the notification style is DM
                if (row.notification_style === 'DM') {
                    const user = await client.users.fetch(row.notification_to);
                    user.send('This is a test DM notification!');
                } 
                // Notify the user if the notification style is a channel
                else if (row.notification_style === 'Channel') {
                    const channel = await client.channels.fetch(row.notification_to);
                    channel.send('This is a test Channel notification!');
                }
            }
        }
    } catch (error) {
        console.error(error);
        message.reply('The bot is currently not functioning properly. Please try again later.');
    }
});

// Login to Discord with your app's token
client.login(process.env.DISCORD_TOKEN);
