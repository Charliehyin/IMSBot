require('dotenv').config();
const { SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder, AttachmentBuilder } = require('discord.js');
const { embedColor, tracking_channel } = require('../constants');
const API_KEY = process.env.HYPIXEL_API_KEY;
const { createCanvas } = require('canvas');

const fetch_user_farming_xp = async (uuid) => {
    try {
        const fetch = (await import('node-fetch')).default;
        const playerResponse = await fetch(`https://api.hypixel.net/v2/skyblock/profiles?key=${API_KEY}&uuid=${uuid}`);
        const playerData = await playerResponse.json();

        let totalFarmingXP = 0;
        if (playerData.profiles) {
            const profileKeys = Object.keys(playerData.profiles);
            for (const profileKey of profileKeys) {
                if (playerData.profiles[profileKey].game_mode !== 'ironman') {
                    continue;
                }

                let farmingXPFloat = 0;
                try {
                    const farmingXP = playerData.profiles[profileKey].members[uuid].player_data.experience.SKILL_FARMING;
                    farmingXPFloat = parseFloat(farmingXP);
                } catch (error) {
                    // No farming XP data for this profile
                }

                if (farmingXPFloat > 0) {
                    totalFarmingXP += farmingXPFloat;
                }
            }
        }
        return totalFarmingXP;
    } catch (error) {
        console.error(`Error fetching farming XP for user ${uuid}:`, error);
        return 0;
    }
};

const get_username_from_uuid = async (db, uuid) => {
    try {
        const [userRows] = await db.query('SELECT ign FROM members WHERE uuid = ?', [uuid]);
        if (userRows.length > 0) {
            return userRows[0].ign;
        } else {
            // If not found in database, fetch from Mojang API
            const fetch = (await import('node-fetch')).default;
            const playerNameResponse = await fetch(`https://api.mojang.com/user/profile/${uuid}`);
            const playerNameData = await playerNameResponse.json();
            return playerNameData.name;
        }
    } catch (error) {
        console.error(`Error getting username for UUID ${uuid}:`, error);
        return uuid;
    }
};

const create_farming_xp_graph = async (data) => {
    const width = 800;
    const height = 400;
    const canvas = createCanvas(width, height);
    const ctx = canvas.getContext('2d');

    // Set background
    ctx.fillStyle = '#36393f';
    ctx.fillRect(0, 0, width, height);

    // Set margins
    const margin = { top: 40, right: 40, bottom: 60, left: 80 };
    const graphWidth = width - margin.left - margin.right;
    const graphHeight = height - margin.top - margin.bottom;

    // Find min and max values
    const xpValues = data.map(d => d.farming_xp);
    const minXP = Math.min(...xpValues);
    const maxXP = Math.max(...xpValues);
    const xpRange = maxXP - minXP;

    // Handle case where all values are the same
    if (xpRange === 0) {
        // Draw a horizontal line
        ctx.strokeStyle = '#7289da';
        ctx.lineWidth = 3;
        ctx.beginPath();
        const y = height - margin.bottom - (graphHeight / 2);
        ctx.moveTo(margin.left, y);
        ctx.lineTo(width - margin.right, y);
        ctx.stroke();
        
        // Draw single value label
        ctx.fillStyle = '#ffffff';
        ctx.font = '12px Arial';
        ctx.textAlign = 'right';
        ctx.fillText(minXP.toLocaleString(), margin.left - 10, y + 4);
    } else {
        // Draw axes
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 2;
        ctx.beginPath();
        // Y-axis
        ctx.moveTo(margin.left, margin.top);
        ctx.lineTo(margin.left, height - margin.bottom);
        // X-axis
        ctx.lineTo(width - margin.right, height - margin.bottom);
        ctx.stroke();

        // Draw data points and line
        if (data.length > 1) {
            ctx.strokeStyle = '#7289da';
            ctx.lineWidth = 3;
            ctx.beginPath();

            for (let i = 0; i < data.length; i++) {
                const x = margin.left + (i / (data.length - 1)) * graphWidth;
                const y = height - margin.bottom - ((data[i].farming_xp - minXP) / xpRange) * graphHeight;

                if (i === 0) {
                    ctx.moveTo(x, y);
                } else {
                    ctx.lineTo(x, y);
                }

                // Draw data point
                ctx.fillStyle = '#7289da';
                ctx.beginPath();
                ctx.arc(x, y, 4, 0, 2 * Math.PI);
                ctx.fill();
            }
            ctx.stroke();
        }

        // Draw Y-axis labels
        ctx.fillStyle = '#ffffff';
        ctx.font = '12px Arial';
        ctx.textAlign = 'right';
        const ySteps = 5;
        for (let i = 0; i <= ySteps; i++) {
            const yValue = minXP + (xpRange * i / ySteps);
            const y = height - margin.bottom - (i / ySteps) * graphHeight;
            ctx.fillText(yValue.toLocaleString(), margin.left - 10, y + 4);
        }
    }

    // Draw title
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 20px Arial';
    ctx.textAlign = 'center';
    ctx.fillText('Farming XP Over Time', width / 2, 25);

    // Draw X-axis labels (time)
    ctx.textAlign = 'center';
    const xSteps = Math.min(5, data.length - 1);
    for (let i = 0; i <= xSteps && data.length > 1; i++) {
        const dataIndex = Math.floor(i * (data.length - 1) / xSteps);
        const x = margin.left + (dataIndex / (data.length - 1)) * graphWidth;
        const time = new Date(data[dataIndex].time_stamp);
        const timeStr = time.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
        ctx.fillText(timeStr, x, height - margin.bottom + 20);
    }

    // Add XP gain info
    if (data.length > 1) {
        const totalGain = data[data.length - 1].farming_xp - data[0].farming_xp;
        ctx.font = '14px Arial';
        ctx.textAlign = 'left';
        ctx.fillText(`Total XP Gain: ${totalGain.toLocaleString()}`, margin.left, height - 10);
    }

    return canvas.toBuffer();
};

// Main tracking processor - called every 5 minutes from app.js
const process_active_tracking_sessions = async (client, db) => {
    try {
        const currentTime = Date.now();
        
        // Get all active tracking sessions
        const [activeSessions] = await db.query(
            'SELECT * FROM active_tracking_sessions WHERE end_time > ?',
            [currentTime]
        );

        console.log(`Processing ${activeSessions.length} active tracking sessions...`);

        for (const session of activeSessions) {
            try {
                // Fetch current farming XP
                const farmingXP = await fetch_user_farming_xp(session.user_id);

                console.log(`   ${session.username} has ${farmingXP} farming XP`);
                
                // Insert tracking data
                await db.query(
                    'INSERT INTO tracked_member_data (username, user_id, time_stamp, farming_xp, tracking_session_id) VALUES (?, ?, ?, ?, ?)',
                    [session.username, session.user_id, currentTime, farmingXP, session.session_id]
                );

                // Update last check time
                await db.query(
                    'UPDATE active_tracking_sessions SET last_check = ? WHERE session_id = ?',
                    [currentTime, session.session_id]
                );
                
                // Add delay between API calls to avoid rate limiting
                await new Promise(resolve => setTimeout(resolve, 1000));
            } catch (error) {
                console.error(`Error processing session ${session.session_id}:`, error);
            }
        }

        // Check for completed sessions
        const [completedSessions] = await db.query(
            'SELECT * FROM active_tracking_sessions WHERE end_time <= ?',
            [currentTime]
        );

        for (const session of completedSessions) {
            try {
                await complete_tracking_session(client, db, session);
            } catch (error) {
                console.error(`Error completing session ${session.session_id}:`, error);
            }
        }

    } catch (error) {
        console.error('Error processing tracking sessions:', error);
    }
};

const complete_tracking_session = async (client, db, session) => {
    try {
        console.log(`Completing tracking session for ${session.username}`);
        
        // Fetch all data for this session
        const [sessionData] = await db.query(
            'SELECT * FROM tracked_member_data WHERE tracking_session_id = ? ORDER BY time_stamp ASC',
            [session.session_id]
        );

        if (sessionData.length > 0) {
            // Generate graph
            const graphBuffer = await create_farming_xp_graph(sessionData);
            const attachment = new AttachmentBuilder(graphBuffer, { name: 'farming_xp_graph.png' });

            // Calculate statistics
            const totalGain = sessionData[sessionData.length - 1].farming_xp - sessionData[0].farming_xp;
            const durationHours = (session.end_time - session.start_time) / (60 * 60 * 1000);

            const embed = new EmbedBuilder()
                .setTitle(`Farming XP Tracking Complete - ${session.username}`)
                .setDescription(`Tracking completed after ${durationHours} hour(s)`)
                .addFields(
                    { name: 'Total XP Gain', value: totalGain.toLocaleString(), inline: true },
                    { name: 'XP per Hour', value: (totalGain / durationHours).toFixed(0), inline: true },
                    { name: 'Data Points', value: sessionData.length.toString(), inline: true }
                )
                .setColor(embedColor)
                .setImage('attachment://farming_xp_graph.png')
                .setTimestamp();

            // Send to channel
            const channel = await client.channels.fetch(session.channel_id);
            await channel.send({ embeds: [embed], files: [attachment] });
        }

        // Remove completed session from database
        await db.query('DELETE FROM active_tracking_sessions WHERE session_id = ?', [session.session_id]);
        
        console.log(`Completed and cleaned up session: ${session.session_id}`);
    } catch (error) {
        console.error(`Error completing tracking session ${session.session_id}:`, error);
    }
};

const track_user_command = new SlashCommandBuilder()
    .setName('track_user')
    .setDescription('Track a user\'s farming XP over time (Moderator only)')
    .addStringOption(option =>
        option.setName('username')
            .setDescription('Minecraft username to track')
            .setRequired(true))
    .addIntegerOption(option =>
        option.setName('duration')
            .setDescription('Duration to track (in hours)')
            .setRequired(true)
            .addChoices(
                { name: '1 hour', value: 1 },
                { name: '2 hours', value: 2 },
                { name: '3 hours', value: 3 },
                { name: '6 hours', value: 6 },
                { name: '12 hours', value: 12 },
                { name: '24 hours', value: 24 }
            ))
    .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers);

const track_user_interaction = async (interaction, db, client) => {
    try {
        await interaction.deferReply({ ephemeral: false });
        
        const username = interaction.options.getString('username');
        const duration = interaction.options.getInteger('duration') * 60 * 60 * 1000; // Convert to milliseconds

        // Get UUID from username
        let uuid;
        try {
            const [userRows] = await db.query('SELECT uuid FROM members WHERE ign = ?', [username]);
            if (userRows.length > 0) {
                uuid = userRows[0].uuid;
            } else {
                // Try to get UUID from Mojang API
                const fetch = (await import('node-fetch')).default;
                const response = await fetch(`https://api.mojang.com/users/profiles/minecraft/${username}`);
                if (!response.ok) {
                    await interaction.editReply(`User "${username}" not found.`);
                    return;
                }
                const data = await response.json();
                uuid = data.id;
            }
        } catch (error) {
            await interaction.editReply(`Error finding user "${username}": ${error.message}`);
            return;
        }

        // Check if user is already being tracked
        const [existingSessions] = await db.query(
            'SELECT * FROM active_tracking_sessions WHERE user_id = ? AND end_time > ?',
            [uuid, Date.now()]
        );

        if (existingSessions.length > 0) {
            await interaction.editReply(`User "${username}" is already being tracked! Session ends <t:${Math.floor(existingSessions[0].end_time / 1000)}:R>`);
            return;
        }

        // Get initial farming XP
        const initialXP = await fetch_user_farming_xp(uuid);
        
        // Create tracking session
        const sessionId = `${uuid}_${Date.now()}`;
        const startTime = Date.now();
        const endTime = startTime + duration;

        console.log(`   Initial XP: ${initialXP}`);

        await db.query(
            'INSERT INTO active_tracking_sessions (session_id, user_id, username, start_time, end_time, channel_id) VALUES (?, ?, ?, ?, ?, ?)',
            [sessionId, uuid, username, startTime, endTime, tracking_channel]
        );

        // Insert initial data point
        await db.query(
            'INSERT INTO tracked_member_data (username, user_id, time_stamp, farming_xp, tracking_session_id) VALUES (?, ?, ?, ?, ?)',
            [username, uuid, startTime, initialXP, sessionId]
        );

        const embed = new EmbedBuilder()
            .setTitle('User Tracking Started')
            .setDescription(`Now tracking **${username}**'s farming XP`)
            .addFields(
                { name: 'Duration', value: `${duration / (60 * 60 * 1000)} hour(s)`, inline: true },
                { name: 'Check Interval', value: '5 minutes', inline: true },
                { name: 'Results Channel', value: `<#${tracking_channel}>`, inline: true },
                { name: 'Starting XP', value: initialXP.toLocaleString(), inline: true },
                { name: 'Ends', value: `<t:${Math.floor(endTime / 1000)}:R>`, inline: true }
            )
            .setColor(embedColor)
            .setTimestamp();

        await interaction.editReply({ embeds: [embed] });

        console.log(`Started tracking ${username} (${uuid}) for ${duration / (60 * 60 * 1000)} hours`);

    } catch (error) {
        console.error('Error in track_user command:', error);
        await interaction.editReply(`An error occurred: ${error.message}`);
    }
};

// Function to stop all tracking (for cleanup)
const stop_all_tracking = async (db) => {
    try {
        const [activeSessions] = await db.query('SELECT COUNT(*) as count FROM active_tracking_sessions');
        if (activeSessions[0].count > 0) {
            await db.query('DELETE FROM active_tracking_sessions');
            console.log(`Stopped ${activeSessions[0].count} active tracking sessions`);
        }
    } catch (error) {
        console.error('Error stopping tracking sessions:', error);
    }
};

module.exports = { 
    track_user_command, 
    track_user_interaction, 
    process_active_tracking_sessions,
    stop_all_tracking,
    fetch_user_farming_xp 
};
