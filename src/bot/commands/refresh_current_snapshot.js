require('dotenv').config();
const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const {
    guild_id: discord_guild_id,
    ims_guild_id,
    imc_guild_id,
    ima_guild_id,
    ims_guild_role,
    imc_guild_role,
    ima_guild_role
} = require('../constants');

const API_KEY = process.env.HYPIXEL_API_KEY;

const guildIds = [
    { id: ims_guild_id, name: 'IMS' },
    { id: imc_guild_id, name: 'IMC' },
    { id: ima_guild_id, name: 'IMA' }
];

const roleByGuildId = new Map([
    [ims_guild_id, ims_guild_role],
    [imc_guild_id, imc_guild_role],
    [ima_guild_id, ima_guild_role],
]);

const refresh_current_snapshot_command = new SlashCommandBuilder()
    .setName('sync_current_guild_members')
    .setDescription('Syncs current guild members (Hypixel) to DB flags and Discord roles')
    .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers)
    .setDMPermission(false)
    .addStringOption(option =>
        option
            .setName('guild')
            .setDescription('Which guild to sync (default: all)')
            .addChoices(
                { name: 'All', value: 'all' },
                { name: 'IMS', value: ims_guild_id },
                { name: 'IMC', value: imc_guild_id },
                { name: 'IMA', value: ima_guild_id }
            ));

async function fetchGuildMemberUUIDs(guildId) {
    console.log(`Fetching guild data for ${guildId}...`);
    const fetch = (await import('node-fetch')).default;
    const response = await fetch(`https://api.hypixel.net/guild?key=${API_KEY}&id=${guildId}`);
    const guildData = await response.json();
    if (!guildData.success || !guildData.guild || !Array.isArray(guildData.guild.members)) {
        throw new Error(guildData.cause || 'Failed to fetch guild data');
    }
    const uuids = guildData.guild.members.map(m => m.uuid);
    console.log(`  Found ${uuids.length} members for guild ${guildId}`);
    return uuids;
}

async function ensureRowsForNewMembers(db, guildId, memberUUIDs) {
    if (!memberUUIDs.length) return 0;
    const fetch = (await import('node-fetch')).default;
    // Find which UUIDs already have data for this guild
    const [existingRows] = await db.query(
        'SELECT DISTINCT user_id FROM guild_member_data WHERE guild_id = ? AND user_id IN (?)',
        [guildId, memberUUIDs]
    );
    const existingSet = new Set(existingRows.map(r => r.user_id));
    const missing = memberUUIDs.filter(uuid => !existingSet.has(uuid));
    if (!missing.length) return 0;

    const now = Date.now();
    const values = [];
    for (const uuid of missing) {
        let ign = uuid;
        try {
            const [rows] = await db.query('SELECT ign FROM members WHERE uuid = ? LIMIT 1', [uuid]);
            if (rows.length > 0) {
                ign = rows[0].ign;
            } else {
                const resp = await fetch(`https://api.mojang.com/user/profile/${uuid}`);
                if (resp.ok) {
                    const data = await resp.json();
                    ign = data.name || ign;
                }
            }
        } catch (err) {
            console.error(`Failed to resolve IGN for ${uuid}:`, err.message);
        }
        values.push([guildId, uuid, ign, now, 0, 0, 1]);
    }

    if (values.length) {
        const insertQuery = 'INSERT INTO guild_member_data (guild_id, user_id, username, time_stamp, skyblock_xp, farming_xp, current_snapshot) VALUES ?';
        await db.query(insertQuery, [values]);
    }
    return values.length;
}

async function markCurrentMembers(db, guildId, memberUUIDs) {
    console.log(`Updating current_snapshot for guild ${guildId}...`);

    const chunk = (arr, size) => {
        const res = [];
        for (let i = 0; i < arr.length; i += size) res.push(arr.slice(i, i + size));
        return res;
    };

    // Existing current=1 rows
    const [currentRows] = await db.query(
        'SELECT DISTINCT user_id FROM guild_member_data WHERE guild_id = ? AND current_snapshot = 1',
        [guildId]
    );
    const currentSet = new Set(currentRows.map(r => r.user_id));

    if (memberUUIDs.length === 0) {
        console.warn(`  No members returned for guild ${guildId}; nothing to mark.`);
        return { added: 0, removed: 0, addedList: [], removedList: [] };
    }

    // Ensure we have rows for any new members before flagging
    const inserted = await ensureRowsForNewMembers(db, guildId, memberUUIDs);

    const incomingSet = new Set(memberUUIDs);
    const toAdd = memberUUIDs.filter(uuid => !currentSet.has(uuid));
    const toRemove = [...currentSet].filter(uuid => !incomingSet.has(uuid));

    let added = 0;
    const addedList = [];
    if (toAdd.length > 0) {
        // Batch update latest row per user for all additions
        for (const uuids of chunk(toAdd, 500)) {
            const [result] = await db.query(
                `UPDATE guild_member_data g
                 JOIN (
                    SELECT user_id, MAX(time_stamp) AS ts
                    FROM guild_member_data
                    WHERE guild_id = ? AND user_id IN (?)
                    GROUP BY user_id
                 ) latest ON g.guild_id = ? AND g.user_id = latest.user_id AND g.time_stamp = latest.ts
                 SET g.current_snapshot = 1`,
                [guildId, uuids, guildId]
            );
            added += result.affectedRows || 0;
            addedList.push(...uuids);
        }
    }

    let removed = 0;
    const removedList = [];
    if (toRemove.length > 0) {
        const chunkSize = 500;
        for (let i = 0; i < toRemove.length; i += chunkSize) {
            const chunkIds = toRemove.slice(i, i + chunkSize);
            const [result] = await db.query(
                `UPDATE guild_member_data
                 SET current_snapshot = 0
                 WHERE guild_id = ? AND user_id IN (?) AND current_snapshot = 1`,
                [guildId, chunkIds]
            );
            removed += result.affectedRows || 0;
            removedList.push(...chunkIds);
        }
    }

    console.log(`  Current API members: ${memberUUIDs.length}, existing current_snapshot=1: ${currentSet.size}, inserted: ${inserted}, added: ${added}, removed: ${removed}`);
    console.log(`  Added (uuids): ${addedList.join(', ') || 'none'}`);
    console.log(`  Removed (uuids): ${removedList.join(', ') || 'none'}`);
    return { added, removed, addedList, removedList, inserted };
}

async function removeDiscordRoles(client, roleId, discordUserIds) {
    if (!discordUserIds.length) return { removed: 0, errors: 0 };
    let removed = 0;
    let errors = 0;
    const chunkSize = 50;
    let guild;
    try {
        guild = await client.guilds.fetch(discord_guild_id);
    } catch (err) {
        console.error('Failed to fetch Discord guild for role removals:', err);
        return { removed: 0, errors: discordUserIds.length };
    }

    for (let i = 0; i < discordUserIds.length; i += chunkSize) {
        const batch = discordUserIds.slice(i, i + chunkSize);
        for (const userId of batch) {
            try {
                const member = await guild.members.fetch(userId);
                if (member.roles.cache.has(roleId)) {
                    await member.roles.remove(roleId, 'Removed due to guild snapshot change');
                    removed += 1;
                }
            } catch (err) {
                errors += 1;
                console.error(`Failed to remove role for ${userId}:`, err.message);
            }
        }
    }
    return { removed, errors };
}

async function addDiscordRoles(client, roleId, discordUserIds) {
    if (!discordUserIds.length) return { added: 0, errors: 0 };
    let added = 0;
    let errors = 0;
    const chunkSize = 50;
    let guild;
    try {
        guild = await client.guilds.fetch(discord_guild_id);
    } catch (err) {
        console.error('Failed to fetch Discord guild for role additions:', err);
        return { added: 0, errors: discordUserIds.length };
    }

    for (let i = 0; i < discordUserIds.length; i += chunkSize) {
        const batch = discordUserIds.slice(i, i + chunkSize);
        for (const userId of batch) {
            try {
                const member = await guild.members.fetch(userId);
                if (!member.roles.cache.has(roleId)) {
                    await member.roles.add(roleId, 'Added due to guild snapshot change');
                    added += 1;
                }
            } catch (err) {
                errors += 1;
                console.error(`Failed to add role for ${userId}:`, err.message);
            }
        }
    }
    return { added, errors };
}

async function sync_all_guilds(db, client, targetGuildIds = null) {
    const results = [];
    const selected = targetGuildIds
        ? guildIds.filter(g => targetGuildIds.includes(g.id))
        : guildIds;

    for (const { id, name } of selected) {
        try {
            const uuids = await fetchGuildMemberUUIDs(id);
            const { added, removed, addedList, removedList, inserted } = await markCurrentMembers(db, id, uuids);

            const roleId = roleByGuildId.get(id);
            let roleRemovals = { removed: 0, errors: 0 };
            let roleAdditions = { added: 0, errors: 0 };

            if (roleId && removedList.length > 0) {
                const [rows] = await db.query(
                    'SELECT DISTINCT discord_id FROM members WHERE uuid IN (?) AND discord_id IS NOT NULL',
                    [removedList]
                );
                const discordIds = rows.map(r => r.discord_id);
                if (discordIds.length > 0) {
                    roleRemovals = await removeDiscordRoles(client, roleId, discordIds);
                }
            }

            if (roleId && addedList.length > 0) {
                const [rows] = await db.query(
                    'SELECT DISTINCT discord_id FROM members WHERE uuid IN (?) AND discord_id IS NOT NULL',
                    [addedList]
                );
                const discordIds = rows.map(r => r.discord_id);
                if (discordIds.length > 0) {
                    roleAdditions = await addDiscordRoles(client, roleId, discordIds);
                }
            }

            results.push(`${name} : api=${uuids.length}, inserted=${inserted}, added=${added}, removed=${removed}, role adds=${roleAdditions.added}, add errors=${roleAdditions.errors}, role removals=${roleRemovals.removed}, remove errors=${roleRemovals.errors}`);
        } catch (err) {
            console.error(`Error refreshing current_snapshot for ${name}:`, err);
            results.push(`${name} : error - ${err.message}`);
        }
    }
    return results;
}

const refresh_current_snapshot_interaction = async (interaction, db, client) => {
    await interaction.deferReply({ ephemeral: false });
    const selectedGuildId = interaction.options.getString('guild');
    const targetIds = selectedGuildId && selectedGuildId !== 'all' ? [selectedGuildId] : null;
    const results = await sync_all_guilds(db, client, targetIds);
    await interaction.editReply(`Refresh complete:\n${results.join('\n')}`);
};

module.exports = {
    refresh_current_snapshot_command,
    refresh_current_snapshot_interaction,
    fetchGuildMemberUUIDs,
    markCurrentMembers,
    removeDiscordRoles,
    addDiscordRoles,
    roleByGuildId,
    sync_all_guilds
};
