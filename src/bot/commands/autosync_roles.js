require('dotenv').config();
const { SlashCommandBuilder } = require('discord.js');
const { sync_roles_interaction } = require('./sync_roles');
const { guild_id, ims_guild_id, imc_guild_id, ima_guild_id } = require('../constants');

const get_guild_members = async (guild_id) => {
    const fetch = (await import('node-fetch')).default;
    const key = process.env.HYPIXEL_API_KEY;
    const url = `https://api.hypixel.net/v2/guild?key=${key}&id=${guild_id}`;

    try {
        const resp = await fetch(url, {
            method: "GET",
            headers: {
                "Content-Type": "application/json"
            }
        });
        let members = [];
        if (resp.ok) {
            const data = await resp.json();
            if (data.guild === null) {
                console.log(`    ${guild_id} doesn't exist`);
                return members;
            }
            // Find all members in the guild
            for (let member of data.guild.members) {
                members.push(member.uuid);
            }
            
            return members;
        }

        throw new Error('    Error fetching guild data');
    }

    catch (error) {
        console.error('    Error fetching guild data:', error);
    }
}

async function autosync_roles(client, member, guild, db) {
    // Get the member's discord ID from the database
    let sql = `SELECT discord_id FROM members WHERE uuid = ?`;
    let [rows] = await db.query(sql, [member]);
    
    if (rows.length === 0) {
        console.log(`No Discord ID found for UUID: ${member}`);
        return;
    }
    
    const discordId = rows[0].discord_id;
    console.log(`Found Discord ID: ${discordId} for UUID: ${member}`);

    try {
        member = await client.users.fetch(discordId);
        console.log(`    member: ${member}`);
    
        const guildMember = await guild.members.fetch(discordId);
        
        const dummyInteraction = {
            member: guildMember,
            options: {
                getMentionable: () => ({ id: discordId }),
                getString: () => null
            },
            reply: async (content) => {
                console.log(content);
            },
            guild: guild,
            guildId: guild_id,
            channelId: 846643902533337108,
            createdTimestamp: Date.now()
        };
    
        await sync_roles_interaction(dummyInteraction, db);
    }

    catch (error) {
        console.error('Error autosyncing roles:', error);
    }
}

async function autosync_roles_all_guilds(client, db) {
    try {   
        const ims_members = await get_guild_members(ims_guild_id);
        const imc_members = await get_guild_members(imc_guild_id);
        const ima_members = await get_guild_members(ima_guild_id);

        const all_members = ims_members.concat(imc_members, ima_members);
        const guild = await client.guilds.fetch(guild_id);

        for (let member of all_members) {
            await autosync_roles(client, member, guild, db);
            // wait 5 seconds between each member
            await new Promise(resolve => setTimeout(resolve, 10000));
        }
    }
    catch (error) {
        console.error('Error autosyncing roles:', error);
    }
}

module.exports = { autosync_roles_all_guilds };