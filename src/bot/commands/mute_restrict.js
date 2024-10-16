const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const { punishments_interaction } = require('./punishments');
const { punishment_log_channel, lfp_access_role, lfp_plus_access_role, bridge_access_role, muted_role, restricted_role, ticket_restricted_role, flex_restricted_role, qna_restricted_role, suggestion_restricted_role, hos_restricted_role, vc_restricted_role, lfp_restricted_role, lfp_plus_restricted_role, bridge_restricted_role, xp_restricted_role } = require('../constants');

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
            .setRequired(true))
    .addBooleanOption(option =>
        option.setName('silent')
            .setDescription('Do not log this mute')
            .setRequired(false));

const restrict_command = new SlashCommandBuilder()
    .setName('restrict')
    .setDescription('Restrict a user')
    .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers)
    .addMentionableOption(option =>
        option.setName('user')
            .setDescription('The user to restrict')
            .setRequired(true))
    .addStringOption(option =>
        option.setName('type')
            .setDescription('Type of restriction')
            .setRequired(true)
            .addChoices(
                { name: 'restrict', value: 'restrict' },
                { name: 'ticket', value: 'ticket' },
                { name: 'flex', value: 'flex' },
                { name: 'qna', value: 'qna' },
                { name: 'suggestion', value: 'suggestion' },
                { name: 'hos', value: 'hos' },
                { name: 'vc', value: 'vc' },
                { name: 'lfp', value: 'lfp' },
                { name: 'lfp_plus', value: 'lfp_plus' },
                { name: 'bridge', value: 'bridge' },
                { name: 'xp', value: 'xp' }
            ))
    .addStringOption(option =>
        option.setName('duration')
            .setDescription('Restrict duration (e.g., 1s, 1m, 1h, 1d, 1w)')
            .setRequired(true))
    .addStringOption(option =>
        option.setName('reason')
            .setDescription('Reason for restricting')
            .setRequired(true))
    .addBooleanOption(option =>
        option.setName('silent')
            .setDescription('Do not log this restriction')
            .setRequired(false));

const punish_interaction = async (interaction, db, punishment_type) => {
    const user = interaction.options.getUser('user');
    const duration = interaction.options.getString('duration');
    const reason = interaction.options.getString('reason');
    let role;
    let silent = interaction.options.getBoolean('silent') ?? false;

    if (punishment_type === 'mute') {
        role = muted_role;
    }
    else {
        restrict_type = interaction.options.getString('type');
        if (restrict_type === 'restrict') {
            role = restricted_role;
            punishment_type = 'restrict';
        }
        else if (restrict_type === 'ticket') {
            role = ticket_restricted_role;
            punishment_type = 'ticket';
        }
        else if (restrict_type === 'flex') {
            role = flex_restricted_role;
            punishment_type = 'flex';
        }
        else if (restrict_type === 'qna') {
            role = qna_restricted_role;
            punishment_type = 'qna';
        }
        else if (restrict_type === 'suggestion') {
            role = suggestion_restricted_role;
            punishment_type = 'suggestion';
        }
        else if (restrict_type === 'hos') {
            role = hos_restricted_role;
            punishment_type = 'hos';
        }
        else if (restrict_type === 'vc') {
            role = vc_restricted_role;
            punishment_type = 'vc';
        }
        else if (restrict_type === 'lfp') {
            role = lfp_restricted_role;
            punishment_type = 'lfp';
        }
        else if (restrict_type === 'lfp_plus') {
            role = lfp_plus_restricted_role;
            punishment_type = 'lfp_plus';
        }
        else if (restrict_type === 'bridge') {
            role = bridge_restricted_role;
            punishment_type = 'bridge';
        }
        else if (restrict_type === 'xp') {
            role = xp_restricted_role;
            punishment_type = 'xp';
        }
        else {
            return interaction.reply('Invalid punishment type. Please use a valid punishment type.');
        }
    }

    // Parse duration
    const durationInMs = parseDuration(duration);
    if (!durationInMs) {
        return interaction.reply('Invalid duration format. Please use formats like 1h, 1d, or 1w.');
    }

    const endTime = Date.now() + durationInMs;

    try {
        // Check if user is already muted/restricted
        let sql = 'SELECT * FROM current_punishments WHERE user_id = ? AND guild_id = ? AND punishment_type = ?';
        const [rows] = await db.query(sql, [user.id, interaction.guildId, punishment_type]);
        if (rows.length > 0) {
            // Replace original end time with new end time
            sql = 'UPDATE current_punishments SET end_time = ? WHERE id = ?';
            await db.query(sql, [endTime, rows[0].id]);
        }

        // Add mute to database
        sql = 'INSERT INTO current_punishments (user_id, guild_id, end_time, reason, punishment_type) VALUES (?, ?, ?, ?, ?)';
        await db.query(sql, [user.id, interaction.guildId, endTime, reason, punishment_type]);

        // Apply punishment role
        const member = await interaction.guild.members.fetch(user.id);
        await member.roles.add(role);

        if (punishment_type === 'lfp_plus') {
            await member.roles.remove(lfp_plus_access_role)
        }
        if (punishment_type === 'lfp') {
            await member.roles.remove(lfp_access_role)
        }
        if (punishment_type === 'bridge') {
            await member.roles.remove(bridge_access_role)
        }

        if (!silent) {
            // Create a separate channel object for the punishment log
            const punishmentLogChannel = await interaction.guild.channels.fetch(punishment_log_channel);

            // Modify the fakeInteraction to use the punishment log channel
            const fakeInteraction = {
                options: {
                    getMentionable: () => ({ id: user.id }),
                    getSubcommand: () => 'add',
                    getString: (name) => {
                        if (name === 'punishment') {
                            if (punishment_type === 'mute') {
                                return `${duration} mute`;
                            }
                            else if (punishment_type === 'restrict') {
                                return `${duration} restriction`;
                            }
                            else {
                                return `${duration} ${punishment_type} restricted`;
                            }
                        }
                        else if (name === 'reason') {
                            return reason;
                        }
                        else {
                            return null;
                        }
                    }
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
        }

        // Reply to the original interaction in the channel where the command was run
        if (punishment_type === 'mute') {
            punishment_string = `**${interaction.user}** muted <@${user.id}> for ${duration}. Reason: ${reason}`;
        }
        else if (punishment_type === 'restrict') {
            punishment_string = `**${interaction.user}** restricted <@${user.id}> for ${duration}. Reason: ${reason}`;
        }
        else {
            punishment_string = `**${interaction.user}** ${punishment_type} restricted <@${user.id}> for ${duration}. Reason: ${reason}`;
        }
        await interaction.reply(punishment_string);

    } catch (error) {
        console.error('Error muting user:', error);
        interaction.reply(`An error occurred while trying to punish the user: ${error}`);
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

async function checkExpiredPunishments(client, db) {
    const sql = 'SELECT * FROM current_punishments WHERE end_time <= ?';
    const [rows] = await db.query(sql, [Date.now()]);

    for (const punishment of rows) {
        try {
            const guild = await client.guilds.fetch(punishment.guild_id);
            const member = await guild.members.fetch(punishment.user_id);

            if (member) {
                if (punishment.punishment_type === 'mute') {
                    await member.roles.remove(muted_role);
                    console.log(`Unmuted ${member.user.tag} in ${guild.name}`);
                }
                else if (punishment.punishment_type === 'restrict') {
                    await member.roles.remove(restricted_role);
                    console.log(`Unrestricted ${member.user.tag} in ${guild.name}`);
                }
                else if (punishment.punishment_type === 'ticket') {
                    await member.roles.remove(ticket_restricted_role);
                    console.log(`Un-ticket-restricted ${member.user.tag} in ${guild.name}`);
                }
                else if (punishment.punishment_type === 'flex') {
                    await member.roles.remove(flex_restricted_role);
                    console.log(`Un-flex-restricted ${member.user.tag} in ${guild.name}`);
                }
                else if (punishment.punishment_type === 'qna') {
                    await member.roles.remove(qna_restricted_role);
                    console.log(`Un-qna-restricted ${member.user.tag} in ${guild.name}`);
                }
                else if (punishment.punishment_type === 'suggestion') {
                    await member.roles.remove(suggestion_restricted_role);
                    console.log(`Un-suggestion-restricted ${member.user.tag} in ${guild.name}`);
                }
                else if (punishment.punishment_type === 'hos') {
                    await member.roles.remove(hos_restricted_role);
                    console.log(`Un-hos-restricted ${member.user.tag} in ${guild.name}`);
                }
                else if (punishment.punishment_type === 'vc') {
                    await member.roles.remove(vc_restricted_role);
                    console.log(`Un-vc-restricted ${member.user.tag} in ${guild.name}`);
                }
                else if (punishment.punishment_type === 'lfp') {
                    await member.roles.remove(lfp_restricted_role);
                    console.log(`Un-lfp-restricted ${member.user.tag} in ${guild.name}`);
                }
                else if (punishment.punishment_type === 'lfp_plus') {
                    await member.roles.remove(lfp_plus_restricted_role);
                    console.log(`Un-lfp_plus-restricted ${member.user.tag} in ${guild.name}`);
                }
                else if (punishment.punishment_type === 'bridge') {
                    await member.roles.remove(bridge_restricted_role);
                    console.log(`Un-bridge-restricted ${member.user.tag} in ${guild.name}`);
                }
                else if (punishment.punishment_type === 'xp') {
                    await member.roles.remove(xp_restricted_role);
                    console.log(`Un-xp-restricted ${member.user.tag} in ${guild.name}`);
                }
                else {
                    console.log(`Unknown punishment type: ${punishment.punishment_type}`);
                }
            }
        } catch (error) {
            console.error('Error removing punishment from user:', error);
        }
        await db.query('DELETE FROM current_punishments WHERE id = ?', [punishment.id]);
    }
}

module.exports = { mute_command, restrict_command, punish_interaction, checkExpiredPunishments };
