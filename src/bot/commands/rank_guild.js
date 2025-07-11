require('dotenv').config();
const { SlashCommandBuilder } = require('discord.js');
const { embedColor, ims_guild_id, imc_guild_id, ima_guild_id } = require('../constants');
const API_KEY = process.env.HYPIXEL_API_KEY;
const { ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder } = require('discord.js');
const members_per_page = 65;

const fetch_specific_guild_data = async (client, db, guild_id) => {
    const fetch = (await import('node-fetch')).default;
    const response = await fetch(`https://api.hypixel.net/guild?key=${API_KEY}&id=${guild_id}`);
    const guildData = await response.json();
    const members = guildData.guild.members;
    let players = [];

    for (const member of members) {
        try {
            // Fetch data for the player
            const playerResponse = await fetch(`https://api.hypixel.net/v2/skyblock/profiles?key=${API_KEY}&uuid=${member.uuid}`);
            const playerData = await playerResponse.json();

            // Query the database to get the username from UUID
            const [userRows] = await db.query('SELECT ign FROM members WHERE uuid = ?', [member.uuid]);
            let playerName;
            if (userRows.length > 0) {
                playerName = userRows[0].ign;
                console.log(`    Player found in database: ${playerName}`);
            } else {
                // If not found in database, fetch from Mojang API
                const playerNameResponse = await fetch(`https://api.mojang.com/user/profile/${member.uuid}`);
                const playerNameData = await playerNameResponse.json();
                playerName = playerNameData.name;
                console.log(`    Player fetched from Mojang API: ${playerName}`);
            }

            let skyblockXP = 0;
            let totalFarmingXP = 0;
            if (playerData.profiles) {
                const profileKeys = Object.keys(playerData.profiles);
                for (const profileKey of profileKeys) {
                    if (playerData.profiles[profileKey].game_mode !== 'ironman') {
                        continue;
                    }

                    console.log(`        Profile: ${profileKey}`);
                    console.log(`        UUID: ${member.uuid}`);
                    
                    const profileXP = playerData.profiles[profileKey].members[member.uuid].leveling.experience;

                    let farmingXP = 0;
                    let farmingXPFloat = 0;
                    try {
                        farmingXP = playerData.profiles[profileKey].members[member.uuid].player_data.experience.SKILL_FARMING;
                        farmingXPFloat = parseFloat(farmingXP);
                        console.log(`        Farming XP: ${farmingXPFloat}`);
                    } catch (error) {
                        // console.error(`Error fetching farming XP for player ${member.uuid}:`, error);
                    }
                    
                    if (profileXP && profileXP > skyblockXP) {
                        skyblockXP = profileXP;
                    }

                    if (farmingXPFloat > 0) {
                        totalFarmingXP += farmingXPFloat;
                    }

                    console.log(`        XP: ${skyblockXP}`);
                }
                console.log(`        Total Farming XP: ${totalFarmingXP}`);
                players.push({
                    username: playerName,
                    uuid: member.uuid,
                    skyblockXP: parseInt(skyblockXP),
                    farmingXP: parseFloat(totalFarmingXP).toFixed(0)
                });
            }
        } catch (error) {
            console.error(`Error fetching data for player ${member.uuid}:`, error);
        }
        await new Promise(resolve => setTimeout(resolve, 3000));
    }
    // Add player data to the database
    const currentTimestamp = Date.now();
    const insertQuery = 'INSERT INTO guild_member_data (guild_id, user_id, username, time_stamp, skyblock_xp, farming_xp) VALUES ?';
    const values = players.map(player => [
        guild_id,
        player.uuid,
        player.username,
        currentTimestamp,
        player.skyblockXP,
        player.farmingXP
    ]);

    try {
        await db.query(insertQuery, [values]);
        console.log(`Successfully added ${players.length} player(s) data to the database.`);
    } catch (error) {
        console.error('Error inserting player data into the database:', error);
    }
}

const fetch_guild_data = async (client, db) => {
    const guild_ids = [ims_guild_id, imc_guild_id, ima_guild_id];
    for (const guild_id of guild_ids) {
        await fetch_specific_guild_data(client, db, guild_id);
    }
}

const create_embed = async (interaction, title, description, rows) => {
    const pages = [];
        
    for (let i = 0; i < rows.length; i += members_per_page) {
        const pageRows = rows.slice(i, i + members_per_page);
        const embed = new EmbedBuilder()
            .setTitle(title)
            .setColor(embedColor)
            .setFooter({ text: `Page ${pages.length + 1}/${Math.ceil(rows.length / members_per_page)}` });

        let pageDescription = description;
        pageRows.forEach(row => {
            pageDescription += row;
        });

        embed.setDescription(pageDescription);

        pages.push(embed);
    }

    let currentPage = 0;

    const row = new ActionRowBuilder()
        .addComponents(
            new ButtonBuilder()
                .setCustomId('previous')
                .setLabel('Previous')
                .setStyle(ButtonStyle.Primary),
            new ButtonBuilder()
                .setCustomId('next')
                .setLabel('Next')
                .setStyle(ButtonStyle.Primary)
        );

    const response = await interaction.editReply({
        embeds: [pages[currentPage]],
        components: [row],
        fetchReply: true
    });

    const collector = response.createMessageComponentCollector({ time: 60000 });

    collector.on('collect', async i => {
        if (i.customId === 'previous') {
            currentPage = currentPage > 0 ? --currentPage : pages.length - 1;
        } else if (i.customId === 'next') {
            currentPage = currentPage + 1 < pages.length ? ++currentPage : 0;
        }

        await i.update({
            embeds: [pages[currentPage]],
            components: [row]
        });
    });

    collector.on('end', () => {
        row.components.forEach(button => button.setDisabled(true));
        interaction.editReply({ components: [row] });
    });
}

const rank_guild_command = new SlashCommandBuilder()
    .setName('rank_guild')
    .setDescription('Rank the statistics of a guild')
    .addStringOption(option =>
        option.setName('guild')
            .setDescription('name of the guild')
            .setRequired(true)
            .addChoices(
                { name: 'Ironman Sweats', value: 'ims' },
                { name: 'Ironman Casuals', value: 'imc' },
                { name: 'Ironman Academy', value: 'ima' },
            ))
    .addStringOption(option =>
        option.setName('statistic')
            .setDescription('statistic to rank by')
            .setRequired(true)
            .addChoices(
                { name: 'Biweekly Skyblock XP Gain', value: 'biweekly_xp_gain' },
                { name: 'Weekly Skyblock XP Gain', value: 'weekly_xp_gain' },
                { name: 'Daily Guild XP', value: 'daily_gxp' },
                { name: 'Weekly Guild XP', value: 'weekly_gxp' },
                { name: 'Skyblock Level', value: 'level' },
            ))
    .addStringOption(option =>
        option.setName('order')
            .setDescription('order to sort by')
            .addChoices(
                { name: 'Ascending', value: 'ascending' },
                { name: 'Descending', value: 'descending' },
            ));

const rank_guild_interaction = async (interaction, db) => {
    try {
        await interaction.deferReply({ ephemeral: false });
        console.log('Ranking guild: ');
        let guild = interaction.options.getString('guild');
        const statistic = interaction.options.getString('statistic');

        if (guild.toLowerCase() === 'ims' || guild.toLowerCase() === 'ironman sweats') {
            guild_id = ims_guild_id;
            guild = 'Ironman Sweats';
        } else if (guild.toLowerCase() === 'imc' || guild.toLowerCase() === 'ironman casuals') {
            guild_id = imc_guild_id;
            guild = 'Ironman Casuals';
        } else if (guild.toLowerCase() === 'ima' || guild.toLowerCase() === 'ironman academy') {
            guild_id = ima_guild_id;
            guild = 'Ironman Academy';
        } else {
            guild_id = guild;
        }

        console.log(`    Guild: ${guild}`)
        console.log(`    Statistic: ${statistic}`)

        const fetch = (await import('node-fetch')).default;

        // Fetch guild data from hypixel api
        try {
            const response = await fetch(`https://api.hypixel.net/guild?key=${API_KEY}&id=${guild_id}`);
            const guildData = await response.json();

            if (!guildData) {
                await interaction.editReply(`Failed to fetch guild data: ${guildData.cause}`);
                return;
            }

            if (!guildData.guild) {
                await interaction.editReply(`No guild found with the ID or name: ${guild}`);
                return;
            }

            console.log(`    Valid guild found: ${guildData.guild.name}`);
            
            if (statistic === 'weekly_xp_gain' || statistic === 'biweekly_xp_gain') {
                const currentTimestamp = Date.now();
                let start_time;
                if (statistic === 'biweekly_xp_gain') {
                    start_time = currentTimestamp - 14 * 24 * 60 * 60 * 1000;
                }
                else {
                    start_time = currentTimestamp - 7 * 24 * 60 * 60 * 1000;
                }

                const [timestamps] = await db.query(
                    'SELECT MIN(time_stamp) as oldest_timestamp, MAX(time_stamp) as newest_timestamp FROM guild_member_data WHERE guild_id = ? AND time_stamp > ?',
                    [guild_id, start_time]
                );

                if (!timestamps[0].oldest_timestamp) {
                    await interaction.editReply('No data available for the past week.');
                    return;
                }

                const startTimestamp = timestamps[0].oldest_timestamp;
                const endTimestamp = timestamps[0].newest_timestamp;
                console.log(`    Start timestamp: ${new Date(startTimestamp).toISOString()}`);
                console.log(`    End timestamp: ${new Date(endTimestamp).toISOString()}`);

                // Fetch XP data for all members at start and end timestamps
                const [memberXPs] = await db.query(
                    `SELECT username,
                    MAX(CASE WHEN time_stamp = ? THEN skyblock_xp END) as start_xp,
                    MAX(CASE WHEN time_stamp = ? THEN skyblock_xp END) as end_xp
                    FROM guild_member_data
                    WHERE guild_id = ? AND time_stamp IN (?, ?)
                    GROUP BY user_id, username`,
                    [startTimestamp, endTimestamp, guild_id, startTimestamp, endTimestamp]
                );

                // Calculate XP gain for each member
                let memberXPGains = memberXPs.map(member => ({
                    username: member.username,
                    xp_gain: member.start_xp === null ? 'new' : (member.end_xp || 0) - (member.start_xp || 0)
                }));

                // Sort members by XP gain in descending order
                memberXPGains.sort((a, b) => b.xp_gain - a.xp_gain);

                const order = interaction.options.getString('order');
                if (order === 'ascending') {
                    memberXPGains.reverse();
                }

                // Create an array of text for each member, displaying username and XP gain
                const memberTexts = memberXPGains.map((member, index) => {
                    return `${index + 1}\\. \`${member.username}\` - ${member.xp_gain.toLocaleString()}\n`;
                });

                await create_embed(interaction, 'Weekly Skyblock XP Gain', `Ranking of ${guildData.guild.name} members by Weekly Skyblock XP Gain\nLatest update <t:${parseInt(endTimestamp/1000)}:R>\nEarliest update <t:${parseInt(startTimestamp/1000)}:R>\n`, memberTexts);
                
            } else if (statistic === 'daily_gxp') {
                const response = await fetch(`https://api.hypixel.net/guild?key=${API_KEY}&id=${guild_id}`);
                const guildData = await response.json();
                const members = guildData.guild.members;
                let member_data = [];
            
                for (const member of members) {
                    try {
                        let weekly_gxp = member.expHistory;
                        const mostRecentDay = Object.keys(weekly_gxp)[0];
                        const dailyGxp = weekly_gxp[mostRecentDay];

                        // Add member data to the array
                        member_data.push({
                            uuid: member.uuid,
                            gxp: dailyGxp
                        });
                    }
                    catch (error) {
                        console.error(`Error fetching data for player ${member.uuid}:`, error);
                    }
                }
                // Query the database to get usernames for verified users
                const uuidList = member_data.map(member => member.uuid);
                const [verifiedUsers] = await db.query(
                    'SELECT uuid, ign FROM members WHERE uuid IN (?)',
                    [uuidList]
                );

                // Create a map of UUID to username
                const uuidToUsername = new Map(verifiedUsers.map(user => [user.uuid, user.ign]));

                // Update member_data with usernames
                member_data = member_data.map(member => ({
                    ...member,
                    username: uuidToUsername.get(member.uuid) || member.uuid
                }));

                // Sort members by daily GXP in descending order
                member_data.sort((a, b) => b.gxp - a.gxp);

                const order = interaction.options.getString('order');
                if (order === 'ascending') {
                    member_data.reverse();
                }

                // Create an array of text for each member, displaying username and daily GXP
                const memberTexts = member_data.map((member, index) => {
                    return `${index + 1}\\. \`${member.username}\` - ${member.gxp.toLocaleString()} GXP\n`;
                });

                await create_embed(interaction, 'Daily Guild XP Ranking', `Ranking of ${guildData.guild.name} members by Daily Guild XP\n`, memberTexts);

            } else if (statistic === 'weekly_gxp') {
                const response = await fetch(`https://api.hypixel.net/guild?key=${API_KEY}&id=${guild_id}`);
                const guildData = await response.json();
                const members = guildData.guild.members;
                let member_data = [];
            
                for (const member of members) {
                    try {
                        let weekly_gxp = member.expHistory;
                        const days = Object.keys(weekly_gxp);
                        let total_gxp = 0;
                        for (const day of days) {
                            total_gxp += weekly_gxp[day];
                        }

                        // Add member data to the array
                        member_data.push({
                            uuid: member.uuid,
                            gxp: total_gxp
                        });
                    }
                    catch (error) {
                        console.error(`Error fetching data for player ${member.uuid}:`, error);
                    }
                }
                // Query the database to get usernames for verified users
                const uuidList = member_data.map(member => member.uuid);
                const [verifiedUsers] = await db.query(
                    'SELECT uuid, ign FROM members WHERE uuid IN (?)',
                    [uuidList]
                );

                // Create a map of UUID to username
                const uuidToUsername = new Map(verifiedUsers.map(user => [user.uuid, user.ign]));

                // Update member_data with usernames
                member_data = member_data.map(member => ({
                    ...member,
                    username: uuidToUsername.get(member.uuid) || member.uuid
                }));

                // Sort members by daily GXP in descending order
                member_data.sort((a, b) => b.gxp - a.gxp);

                const order = interaction.options.getString('order');
                if (order === 'ascending') {
                    member_data.reverse();
                }

                // Create an array of text for each member, displaying username and weekly GXP
                const memberTexts = member_data.map((member, index) => {
                    return `${index + 1}\\. \`${member.username}\` - ${member.gxp.toLocaleString()} GXP\n`;
                });

                await create_embed(interaction, 'Weekly Guild XP Ranking', `Ranking of ${guildData.guild.name} members by Weekly Guild XP\n`, memberTexts);

            } else if (statistic === 'level') {
                // Fetch the latest skyblock levels for the guild from the database
                let [rows] = await db.query('SELECT time_stamp FROM guild_member_data WHERE guild_id = ? ORDER BY time_stamp DESC LIMIT 1', [guild_id]);
                const latestTimestamp = rows[0].time_stamp;

                console.log(`    Latest timestamp: ${latestTimestamp}`);
                console.log(`    Guild ID: ${guild_id}`);

                [rows] = await db.query(
                    'SELECT username, skyblock_xp FROM guild_member_data WHERE time_stamp = ? AND guild_id = ?',
                    [latestTimestamp, guild_id]
                );

                if (rows.length === 0) {
                    await interaction.editReply(`No data found for the guild with ID: ${guild_id}`);
                    return;
                }

                // Sort members by skyblock XP (level) in descending order
                const sortedMembers = rows
                    .map((row, index) => ({ username: row.username, xp: row.skyblock_xp }))
                    .sort((a, b) => b.xp - a.xp);

                const order = interaction.options.getString('order');
                if (order === 'ascending') {
                    sortedMembers.reverse();
                }
                // Create an array of text for each member, displaying username and XP
                const memberTexts = sortedMembers.map((member, index) => {
                    return `${index + 1}\\. \`${member.username}\` - ${(member.xp / 100).toFixed(2)}\n`;
                });

                await create_embed(interaction, 'Skyblock Level Ranking', `Ranking of ${guild} members by Skyblock Level\nUpdated <t:${parseInt(latestTimestamp/1000)}:R>\n`, memberTexts);
            } else {
                await interaction.editReply(`Invalid statistic: ${statistic}`);
                return;
            }
        } catch (error) {
            console.error('Error checking guild validity:', error);
            await interaction.editReply(`An error occurred while validating the guild: ${error.message}`);
        }

    } catch (error) {
        console.error(error);
        await interaction.editReply(`There was an error while trying to rank the guild: ${error.message}`);
    }
}

module.exports = { fetch_guild_data, rank_guild_command, rank_guild_interaction, create_embed };