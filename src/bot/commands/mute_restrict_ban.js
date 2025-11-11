const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const { punishments_interaction } = require('./punishments');
const { ims_bot_id, punishment_log_channel, lfp_access_role, lfp_plus_access_role, bridge_access_role, muted_role, restricted_role, ticket_restricted_role, flex_restricted_role, qna_restricted_role, suggestion_restricted_role, hos_restricted_role, vc_restricted_role, lfp_restricted_role, lfp_plus_restricted_role, bridge_restricted_role, xp_restricted_role, appeals_server, cheater_role } = require('../constants');
const fetch = (...args) => import('node-fetch').then(({default: fetch}) => fetch(...args));
const { log_action } = require('./log_action');

const mute_command = new SlashCommandBuilder()
    .setName('mute')
    .setDescription('Mute a user')
    .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers)
    .setDMPermission(false)
    .addMentionableOption(option =>
        option.setName('user')
            .setDescription('The user to mute')
            .setRequired(true))
    .addStringOption(option =>
        option.setName('duration')
            .setDescription('Mute duration (e.g., 1s, 1m, 1h, 1d, 1w, perm)')
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
    .setDMPermission(false)
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
            .setDescription('Restrict duration (e.g., 1s, 1m, 1h, 1d, 1w, perm)')
            .setRequired(true))
    .addStringOption(option =>
        option.setName('reason')
            .setDescription('Reason for restricting')
            .setRequired(true))
    .addBooleanOption(option =>
        option.setName('silent')
            .setDescription('Do not log this restriction')
            .setRequired(false));

const ban_command = new SlashCommandBuilder()
    .setName('ban')
    .setDescription('Ban a user')
    .setDefaultMemberPermissions(PermissionFlagsBits.BanMembers)
    .setDMPermission(false)
    .addMentionableOption(option =>
        option.setName('user')
            .setDescription('The user to ban')
            .setRequired(true))
    .addStringOption(option =>
        option.setName('reason')
            .setDescription('Reason for banning')
            .setRequired(true));

const unban_command = new SlashCommandBuilder()
    .setName('unban')
    .setDescription('Unban a user')
    .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers)
    .setDMPermission(false)
    .addStringOption(option =>
        option.setName('user_id')
            .setDescription('The user_id of the user to unban')
            .setRequired(true));

const ban_interaction = async (interaction, db) => {
    interaction.deferReply();
    const user = interaction.options.getUser('user');
    let reason = interaction.options.getString('reason');

    try {
        const punishmentLogChannel = await interaction.guild.channels.fetch(punishment_log_channel);

        // Modify the fakeInteraction to use the punishment log channel
        const fakeInteraction = {
            options: {
                getMentionable: () => ({ id: user.id }),
                getSubcommand: () => 'add',
                getString: (name) => {
                    if (name === 'punishment') {
                        return 'ban';
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
            createdTimestamp: interaction.createdTimestamp,
            user: interaction.user,
            client: interaction.client
        };

        // Log the punishment using the modified fakeInteraction
        await punishments_interaction(fakeInteraction, db, 'add');

        let reason_no_appeal = reason;
        if (!reason.includes(appeals_server)) {
            reason = `${reason}\n\nAppeal at: ${appeals_server}`;
        }

        let reply_string = `${user} has been banned. \nReason: ${reason_no_appeal}`;  

        // Get uuid from user's discord id from db
        let sql = `SELECT uuid FROM members WHERE discord_id = ?`;
        let [rows] = await db.query(sql, [user.id]);
        if (rows.length > 0) {
            let uuid = rows[0].uuid;
            let ign;

            try {
                // Fetch current IGN from Mojang API
                const response = await fetch(`https://sessionserver.mojang.com/session/minecraft/profile/${uuid.replace(/-/g, '')}`);
                if (response.ok) {
                    const data = await response.json();
                    ign = data.name;
                } else {
                    // Fallback to nickname/username if API call fails
                    ign = user.nickname ?? user.username;
                    console.error('Failed to fetch IGN from Mojang API:', await response.text());
                }
            } catch (error) {
                // Fallback to nickname/username if API call fails
                ign = user.nickname ?? user.username;
                console.error('Error fetching IGN from Mojang API:', error);
            }

            let cheater = false;

            // blacklist uuid
            sql = `INSERT INTO blacklist (ign, uuid, reason, cheater, time_stamp) VALUES (?, ?, ?, ?, ?)`;
            await db.query(sql, [ign, uuid, reason_no_appeal, cheater, Date.now()]);
            reply_string += `\n\nAlso, ${ign}(${uuid}) has been blacklisted from this server. Cheater status: ${cheater}`;
        }

        try {
            await user.send(`You have been banned from Ironman Sweats.\nReason: ${reason}`);
        } catch (error) {
            reply_string += `\n\nAlso, failed to send DM to ${user.tag}: ${error}`;
        }

        await log_action(interaction.client, `Ban`, interaction.user, `${user.id}`, `${user.tag} was banned from ${interaction.guild.name}. \nReason: ${reason_no_appeal}`);
        await interaction.guild.members.ban(user, { reason: reason_no_appeal });
        await interaction.editReply(reply_string);
    } catch (error) {
        console.error('Error banning user:', error);
        interaction.editReply(`An error occurred while trying to ban the user: ${error}`);
    }
}

const unban_interaction = async (interaction, db) => {
    interaction.deferReply();
    console.log('Unbanning user');
    try {
        const user_id = interaction.options.getString('user_id');
        await interaction.guild.members.unban(user_id);

        let sql = `DELETE FROM blacklist WHERE uuid = ? AND cheater = false`;
        let [rows] = await db.query(sql, [user_id]);
        if (rows.length > 0) {
            console.log(`    User ${user_id} was removed from the blacklist.`);
            await log_action(interaction.client, `Blacklist removed`, interaction.user, `${user_id}`, `${user_id} was removed from the blacklist.`);
        }

        console.log(`    User ${user_id} was unbanned from ${interaction.guild.name}`);
        await interaction.editReply(`${user_id} has been unbanned from ${interaction.guild.name}`);
        await log_action(interaction.client, `Unban`, interaction.user, `${user_id}`, `${user_id} was unbanned.`);
    } catch (error) {
        console.error('Error unbanning user:', error);
        interaction.editReply(`An error occurred while trying to unban the user: ${error}`);
    }
}

const punish_interaction = async (interaction, db, punishment_type) => {
    interaction.deferReply();
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
            return interaction.editReply('Invalid punishment type. Please use a valid punishment type.');
        }
    }

    // Parse duration
    const durationInMs = parseDuration(duration);
    if (!durationInMs) {
        return interaction.editReply('Invalid duration format. Please use formats like 1h, 1d, or 1w.');
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
        if (duration === 'perm') {
            console.log('   Permanent punishment applied');
        }
        else {
            sql = 'INSERT INTO current_punishments (user_id, guild_id, end_time, reason, punishment_type) VALUES (?, ?, ?, ?, ?)';
            await db.query(sql, [user.id, interaction.guildId, endTime, reason, punishment_type]);
        }

        // Apply punishment role
        const member = await interaction.guild.members.fetch(user.id);
        await member.roles.add(role);

        if (punishment_type === 'lfp_plus') {
            await member.roles.add(lfp_restricted_role)
            await member.roles.remove(lfp_plus_access_role)
            await member.roles.remove(lfp_access_role)

            
            let lfp_end_time;
            if (duration === 'perm') {
                // 30 day lfp ban for permanent punishment
                lfp_end_time = Date.now() + 30 * 24 * 60 * 60 * 1000;
            }
            else {
                lfp_end_time = Date.now() + durationInMs;
            }

            let sql = 'SELECT * FROM current_punishments WHERE user_id = ? AND guild_id = ? AND punishment_type = ?';
            const [rows] = await db.query(sql, [user.id, interaction.guildId, 'lfp']);
            if (rows.length > 0) {
                original_lfp_end_time = rows[0].end_time;

                // Replace original end time with longer end time
                if (lfp_end_time > original_lfp_end_time) {
                    sql = 'UPDATE current_punishments SET end_time = ? WHERE id = ?';
                    await db.query(sql, [lfp_end_time, rows[0].id]);
                }
            } else {
                sql = 'INSERT INTO current_punishments (user_id, guild_id, end_time, reason, punishment_type) VALUES (?, ?, ?, ?, ?)';
                await db.query(sql, [user.id, interaction.guildId, Date.now() + 30 * 24 * 60 * 60 * 1000, '30 day LFP ban with LFP+ ban', 'lfp']);
            }

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
                createdTimestamp: interaction.createdTimestamp,
                user: interaction.user,
                client: interaction.client
            };

            // Log the punishment using the modified fakeInteraction
            await punishments_interaction(fakeInteraction, db, 'add');
        }
        let dm_string;
        if (punishment_type === 'mute') {
            // Reply to the original interaction in the channel where the command was run
            dm_string = `You have been muted in ${interaction.guild.name} for ${duration}. \nReason: ${reason}`;
        }
        else if (punishment_type === 'restrict') {
            dm_string = `You have been restricted in ${interaction.guild.name} for ${duration}. \nReason: ${reason}`;
        }
        else {
            dm_string = `You have been ${punishment_type} restricted in ${interaction.guild.name} for ${duration}. \nReason: ${reason}`;
        }
        try {
            await user.send(dm_string);
        } catch (error) {
            console.error(`Failed to send DM to ${user.tag}: ${error}`);
        }

        let punishment_string;
        let punishment_type_string;
        if (punishment_type === 'mute') {
            punishment_string = `**${interaction.user}** muted <@${user.id}> for ${duration}. \nReason: ${reason}`;
            punishment_type_string = 'Mute';
        }
        else if (punishment_type === 'restrict') {
            punishment_string = `**${interaction.user}** restricted <@${user.id}> for ${duration}. \nReason: ${reason}`;
            punishment_type_string = 'Restrict';
        }
        else {
            punishment_string = `**${interaction.user}** ${punishment_type} restricted <@${user.id}> for ${duration}. \nReason: ${reason}`;
            punishment_type_string = punishment_type + ' restricted';
        }
        await log_action(interaction.client, `${punishment_type_string}`, interaction.user, `${user.id}`, punishment_string);
        await interaction.editReply(punishment_string);

    } catch (error) {
        console.error('Error muting user:', error);
        interaction.editReply(`An error occurred while trying to punish the user: ${error}`);
    }
};

function parseDuration(duration) {
    if (duration === 'perm') {
        return 1000 * 60 * 60 * 24 * 365 * 100; // 100 years
    }
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
                let punishment_type_string;
                if (punishment.punishment_type === 'mute') {
                    punishment_type_string = 'mute';
                }
                else if (punishment.punishment_type === 'restrict') {
                    punishment_type_string = 'restrict';
                }
                else {
                    punishment_type_string = punishment.punishment_type + ' restricted';
                }
                ims_bot_user = await client.users.fetch(ims_bot_id);
                await log_action(client, `Un-${punishment_type_string}`, ims_bot_user, rows[0].user_id, `${member.user.tag} was un-${punishment_type_string} in ${guild.name}. \nOriginal reason: ${punishment.reason}`);
            }
        } catch (error) {
            console.error('Error removing punishment from user:', error);
        }
        await db.query('DELETE FROM current_punishments WHERE id = ?', [punishment.id]);
    }
}

module.exports = { mute_command, restrict_command, ban_command, unban_command, ban_interaction, unban_interaction, punish_interaction, checkExpiredPunishments };
