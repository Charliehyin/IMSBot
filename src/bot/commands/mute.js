const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const { punishments_interaction } = require('./punishments');
const { muted_role, punishment_log_channel } = require('../constants');

const mute_command = new SlashCommandBuilder()
    .setName('mute')
    .setDescription('Mute a user')
    .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers)
    .addMentionableOption(option =>
        option.setName('user')
            .setDescription('The user to mute')
            .setRequired(true))
    .addStringOption(option =>
        option.setName('duration')
            .setDescription('Mute duration (e.g., 1s, 1m, 1h, 1d, 1w)')
            .setRequired(true))
    .addStringOption(option =>
        option.setName('reason')
            .setDescription('Reason for muting')
            .setRequired(true));

const mute_interaction = async (interaction, db) => {
    const user = interaction.options.getUser('user');
    const duration = interaction.options.getString('duration');
    const reason = interaction.options.getString('reason');

    // Parse duration
    const durationInMs = parseDuration(duration);
    if (!durationInMs) {
        return interaction.reply('Invalid duration format. Please use formats like 1h, 1d, or 1w.');
    }

    const endTime = Date.now() + durationInMs;

    try {
        // Add mute to database
        const sql = 'INSERT INTO mutes (user_id, guild_id, end_time, reason) VALUES (?, ?, ?, ?)';
        await db.query(sql, [user.id, interaction.guildId, endTime, reason]);

        // Apply mute role
        const member = await interaction.guild.members.fetch(user.id);
        await member.roles.add(muted_role);
        // Create a separate channel object for the punishment log
        const punishmentLogChannel = await interaction.guild.channels.fetch(punishment_log_channel);

        // Modify the fakeInteraction to use the punishment log channel
        const fakeInteraction = {
            options: {
                getMentionable: () => ({ id: user.id }),
                getString: (name) => name === 'punishment' ? `Muted for ${duration}` : reason
            },
            reply: async (content) => {
                // Send the reply to the punishment log channel instead
                await punishmentLogChannel.send(content);
            },
            fetchReply: async () => {
                // Return the last message in the punishment log channel
                const messages = await punishmentLogChannel.messages.fetch({ limit: 1 });
                return messages.first();
            },
            guildId: interaction.guildId,
            channelId: punishment_log_channel,
            createdTimestamp: interaction.createdTimestamp
        };

        // Log the punishment using the modified fakeInteraction
        await punishments_interaction(fakeInteraction, db, 'add');

        // Reply to the original interaction in the channel where the command was run
        await interaction.reply(`**${interaction.user}** muted <@${user.id}> for ${duration}. Reason: ${reason}`);

    } catch (error) {
        console.error('Error muting user:', error);
        interaction.reply(`An error occurred while trying to mute the user: ${error}`);
    }
};

function parseDuration(duration) {
    const regex = /(\d+)([smhdw])/g;
    let totalMs = 0;
    let match;

    while ((match = regex.exec(duration)) !== null) {
        const value = parseInt(match[1]);
        const unit = match[2];

        switch (unit) {
            case 's': totalMs += value * 1000; break;
            case 'm': totalMs += value * 60 * 1000; break;
            case 'h': totalMs += value * 60 * 60 * 1000; break;
            case 'd': totalMs += value * 24 * 60 * 60 * 1000; break;
            case 'w': totalMs += value * 7 * 24 * 60 * 60 * 1000; break;
        }
    }

    return totalMs > 0 ? totalMs : null;
}

async function checkExpiredMutes(client, db) {
    const sql = 'SELECT * FROM mutes WHERE end_time <= ?';
    const [rows] = await db.query(sql, [Date.now()]);

    for (const mute of rows) {
        const guild = await client.guilds.fetch(mute.guild_id);
        const member = await guild.members.fetch(mute.user_id);

        if (member) {
            await member.roles.remove(muted_role);
            console.log(`Unmuted ${member.user.tag} in ${guild.name}`);
        }

        await db.query('DELETE FROM mutes WHERE id = ?', [mute.id]);
    }
}

module.exports = { mute_command, mute_interaction, checkExpiredMutes };
