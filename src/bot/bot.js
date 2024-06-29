require('dotenv').config();
const { Client, GatewayIntentBits, REST, Routes, SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const mysql = require('mysql2/promise');
const { process_nsfw_message } = require('./nsfwDetection');
const { process_moderationapi_message } = require('./moderationApi');

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
                    .setDescription('User ID to track')
                    .setRequired(true))
            .addStringOption(option =>
                option.setName('notification_style')
                    .setDescription('Do you want to be notified via DM or Channel')
                    .setRequired(true)
                    .addChoices(
                        { name: 'DM', value: 'DM' },
                        { name: 'Channel', value: 'Channel' }
                    ))
            .addStringOption(option =>
                option.setName('notification_channel')
                    .setDescription('Notification channel ID (Channel ID or User ID)')
                    .setRequired(true)),
        new SlashCommandBuilder()
            .setName('view_tracks')
            .setDescription('View all the tracks for a specific user')
            .addStringOption(option =>
                option.setName('user_id')
                    .setDescription('currently tracked user ID')
                    .setRequired(true)),
        new SlashCommandBuilder()
            .setName('delete_track')
            .setDescription('Delete a track for a specific user')
            .addStringOption(option =>
                option.setName('track_id')
                    .setDescription('ID of the track to delete')
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
        const targetID = interaction.options.getString('user_id');
        const notificationStyle = interaction.options.getString('notification_style');
        const notificationTo = interaction.options.getString('notification_channel');

        // Store the setup information in the database
        try {
            // Insert into tracks
            const setterId = interaction.user.id;
            const [trackResult] = await db.query(`
                INSERT INTO tracks (targetid, notification_to, notification_style)
                VALUES (?, ?, ?)
            `, [targetID, notificationTo, notificationStyle]);

            await interaction.reply(`Setup completed for user ID: ${targetID} with notification style: ${notificationStyle}`);
        } catch (error) {
            console.error(error);
            await interaction.reply('There was an error setting up the notifications.');
        }
    }
    if (commandName === 'view_tracks') {
        const targetID = interaction.options.getString('user_id');
        // Create an embed for the response

        try {
            const [rows] = await db.query('SELECT * FROM tracks WHERE targetid = ?', [targetID]);
            if (rows.length > 0) {
                const embed = new EmbedBuilder()
                    .setTitle('Track Information')
                    .setDescription(`Tracks for User ID: ${targetID}`)
                    .setColor(0x00AE86);
                for (const row of rows) {
                    let trackInfo = `Notification To: ${row.notification_to}, Notification Style: ${row.notification_style}\n`;
                    embed.addFields({ name: `Track ID: ${row.id}`, value: trackInfo, inline: false });
                }
                await interaction.reply({ embeds: [embed] });
            } else {
                await interaction.reply('No tracks found for the user ID.');
            }
        } catch (error) {
            console.error(error);
            await interaction.reply('There was an error viewing the tracks.');
        }
    }
    if (commandName === 'delete_track') {
        const trackID = interaction.options.getString('track_id');

        try {
            // Delete from tracks
            resp = await db.query('DELETE FROM tracks WHERE id = ?', [trackID]);

            // Check if the track was deleted
            if (resp[0].affectedRows === 0) {
                await interaction.reply('Track not found.');
                return;
            }
            else {
                await interaction.reply('Track deleted successfully.');
            }
        } catch (error) {
            console.error(error);
            await interaction.reply('There was an error deleting the track.');
        }
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
        // await process_nsfw_message(message, process.env.MODEL_URL + "/nsfw/", channel, client);
    } catch (error) {
        console.error(error);
    }
});

// Login to Discord with your app's token
client.login(process.env.DISCORD_TOKEN);
