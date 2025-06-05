require('dotenv').config();
const { SlashCommandBuilder } = require('discord.js');
const { embedColor, ims_guild_id, imc_guild_id, ima_guild_id } = require('../constants');
const API_KEY = process.env.HYPIXEL_API_KEY;
const { ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder } = require('discord.js');
const { create_embed } = require('./rank_guild');
const members_per_page = 65;

const check_garden_command = new SlashCommandBuilder()
    .setName('check_garden')
    .setDescription('Check the guilds top gardeners')
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
        option.setName('timeframe')
            .setDescription('timeframe to check')
            .setRequired(true)
            .addChoices(
                { name: '2 hours', value: '2h' },
                { name: '4 hours', value: '4h' },
                { name: '8 hours', value: '8h' },
                { name: '12 hours', value: '12h' },
                { name: '24 hours', value: '24h' },
            ));

const check_garden_interaction = async (interaction, db) => {
    await interaction.deferReply({ ephemeral: false });
    
    const guild = interaction.options.getString('guild');
    const timeframe = interaction.options.getString('timeframe');

    if (guild.toLowerCase() === 'ims' || guild.toLowerCase() === 'ironman sweats') {
        guild_id = ims_guild_id;
        guild_name = 'Ironman Sweats';
    } else if (guild.toLowerCase() === 'imc' || guild.toLowerCase() === 'ironman casuals') {
        guild_id = imc_guild_id;
        guild_name = 'Ironman Casuals';
    } else if (guild.toLowerCase() === 'ima' || guild.toLowerCase() === 'ironman academy') {
        guild_id = ima_guild_id;
        guild_name = 'Ironman Academy';
    } else {
        guild_id = guild;
    }

    console.log(`    Guild: ${guild_name}`)
    console.log(`    Timeframe: ${timeframe}`)

    const fetch = (await import('node-fetch')).default;

    try {
        // Determine the time period based on the timeframe option
        const currentTimestamp = Date.now();
        let timeAgo;
        
        if (timeframe === '2h') {
            timeAgo = currentTimestamp - 2 * 60 * 60 * 1000;
        } else if (timeframe === '4h') {
            timeAgo = currentTimestamp - 4 * 60 * 60 * 1000;
        } else if (timeframe === '8h') {
            timeAgo = currentTimestamp - 8 * 60 * 60 * 1000;
        } else if (timeframe === '12h') {
            timeAgo = currentTimestamp - 12 * 60 * 60 * 1000;
        } else { // 24h
            timeAgo = currentTimestamp - 24 * 60 * 60 * 1000;
        }

        // Fetch timestamps within the selected timeframe
        const [timestamps] = await db.query(
            'SELECT DISTINCT time_stamp FROM guild_member_data WHERE guild_id = ? AND time_stamp > ? ORDER BY time_stamp DESC LIMIT 2',
            [guild_id, timeAgo]
        );

        if (!timestamps || timestamps.length === 0) {
            await interaction.reply(`No data available for the selected timeframe (${timeframe}).`);
            return;
        }

        // Get the newest and second newest timestamps
        const endTimestamp = timestamps[0].time_stamp;
        const secondNewestTimestamp = timestamps.length > 1 ? timestamps[1].time_stamp : null;
        
        // Get the oldest timestamp for the range
        const [oldestTimestampResult] = await db.query(
            'SELECT MIN(time_stamp) as oldest_timestamp FROM guild_member_data WHERE guild_id = ? AND time_stamp > ?',
            [guild_id, timeAgo]
        );
        
        const startTimestamp = oldestTimestampResult[0].oldest_timestamp;
        
        if (!startTimestamp) {
            await interaction.reply(`No data available for the selected timeframe (${timeframe}).`);
            return;
        }

        console.log(`    Start timestamp: ${new Date(startTimestamp).toISOString()}`);
        console.log(`    End timestamp: ${new Date(endTimestamp).toISOString()}`);
        if (secondNewestTimestamp) {
            console.log(`    Second newest timestamp: ${new Date(secondNewestTimestamp).toISOString()}`);
        }

        // Fetch farming XP data for all members at start, end, and second newest timestamps
        let query = `SELECT username, user_id,
            MAX(CASE WHEN time_stamp = ? THEN farming_xp END) as start_farming_xp,
            MAX(CASE WHEN time_stamp = ? THEN farming_xp END) as end_farming_xp`;
        
        let params = [startTimestamp, endTimestamp, guild_id, startTimestamp, endTimestamp];
        
        if (secondNewestTimestamp) {
            query += `,
            MAX(CASE WHEN time_stamp = ? THEN farming_xp END) as second_newest_farming_xp`;
            params.splice(2, 0, secondNewestTimestamp);
            params.push(secondNewestTimestamp);
        }
        
        query += `
            FROM guild_member_data
            WHERE guild_id = ? AND time_stamp IN (?, ?`;
        
        if (secondNewestTimestamp) {
            query += `, ?`;
        }
        
        query += `)
            GROUP BY user_id, username`;
        
        const [memberFarmingXPs] = await db.query(query, params);

        // Calculate farming XP gain for each member
        let memberFarmingXPGains = memberFarmingXPs.map(member => {
            const recentGain = secondNewestTimestamp && 
                member.end_farming_xp !== null && 
                member.second_newest_farming_xp !== null ? 
                (member.end_farming_xp - member.second_newest_farming_xp) : 0;
            
            return {
                username: member.username,
                farming_xp_gain: member.start_farming_xp === null ? 'new' : (member.end_farming_xp || 0) - (member.start_farming_xp || 0),
                recent_gain: recentGain,
                currently_active: recentGain > 0
            };
        });

        // Sort members by farming XP gain in descending order
        memberFarmingXPGains.sort((a, b) => {
            if (typeof a.farming_xp_gain === 'string' || typeof b.farming_xp_gain === 'string') {
                return typeof b.farming_xp_gain === 'string' ? -1 : 1;
            }
            return b.farming_xp_gain - a.farming_xp_gain;
        });

        // Create an array of text for each member, displaying username and farming XP gain
        const memberTexts = memberFarmingXPGains.map((member, index) => {
            return `${index + 1}\\. \`${member.username}\` - ${typeof member.farming_xp_gain === 'number' ? member.farming_xp_gain.toLocaleString() : member.farming_xp_gain} ${member.currently_active ? ':green_circle:' : ':red_circle:'}\n`;
        });

        await create_embed(interaction, 'Farming XP Gain', `Ranking of ${guild} members by Farming XP Gain\nLatest update <t:${parseInt(endTimestamp/1000)}:R>\nEarliest update <t:${parseInt(startTimestamp/1000)}:R>\n`, memberTexts);
    } catch (error) {
        console.error('Error processing check garden', error);
        await interaction.reply('An error occurred while processing the check garden data.');
        return;
    }
};

module.exports = {
    check_garden_command,
    check_garden_interaction
};
