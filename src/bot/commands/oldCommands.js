const { Client, GatewayIntentBits, REST, Routes, SlashCommandBuilder, EmbedBuilder } = require('discord.js');

const setup_command = new SlashCommandBuilder()
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
            .setRequired(true))

const view_tracks_command = new SlashCommandBuilder()
    .setName('view_tracks')
    .setDescription('View all the tracks for a specific user')
    .addStringOption(option =>
        option.setName('user_id')
            .setDescription('currently tracked user ID')
            .setRequired(true))

const delete_track_command = new SlashCommandBuilder()
    .setName('delete_track')
    .setDescription('Delete a track for a specific user')
    .addStringOption(option =>
        option.setName('track_id')
            .setDescription('ID of the track to delete')
            .setRequired(true))
    
const setup_interaction = async (interaction, db) => {
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

const view_tracks_interaction = async (interaction, db) => {
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

const delete_track_interaction = async (interaction, db) => {
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


module.exports = { setup_command, view_tracks_command, delete_track_command, setup_interaction, view_tracks_interaction, delete_track_interaction}