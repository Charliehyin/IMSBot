require('dotenv').config();
const { SlashCommandBuilder } = require('discord.js');
const { get_guild_info } = require('../utils/get_guild_info');
const { ims_guild_id, imc_guild_id, ima_guild_id } = require('../constants');

const sync_guild_info = async (interaction, uuid) => {
    // Check if user is in IMS guild
    const guild_id = await get_guild_info(uuid);
    const discord_id = interaction.member.id;
    if (guild_id === ims_guild_id) {
        console.log(`    ${uuid} is in IMS guild`);
    } else {
        console.log(`    ${uuid} is not in IMS guild`);
    }

    // Check if user is in IMC guild
    if (guild_id === imc_guild_id) {
        console.log(`    ${uuid} is in IMC guild`);
    } else {
        console.log(`    ${uuid} is not in IMC guild`);
    }

    // Check if user is in IMA guild
    if (guild_id === ima_guild_id) {
        console.log(`    ${uuid} is in IMA guild`);
    } else {
        console.log(`    ${uuid} is not in IMA guild`);
    }
}

const sync_roles_command = new SlashCommandBuilder()
    .setName('sync-roles')
    .setDescription('Syncs roles with guilds');

const sync_roles_interaction = async (interaction, db) => {
    console.log('Syncing roles')
    // Sync guild info
    try {
        const discord_id = interaction.member.id;
        
        // Get uuid from database
        let sql = `SELECT uuid FROM members WHERE discord_id = ?`;
        let [rows] = await db.query(sql, [discord_id]);
        if (rows.length === 0) {
            interaction.reply('You are not verified');
            return;
        }
        const uuid = rows[0].uuid;
        
        console.log(`    uuid: ${uuid}, discord_id: ${discord_id}`)

        await sync_guild_info(interaction, uuid);
        console.log('    Guild roles synced')
    } catch (error) {
        console.error('Error syncing guild info:', error);
    }

    console.log('    Done syncing roles');
    await interaction.reply('Roles synced');
}

module.exports = { sync_guild_info, sync_roles_command, sync_roles_interaction}