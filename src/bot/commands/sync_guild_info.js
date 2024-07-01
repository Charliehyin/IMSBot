require('dotenv').config();
const { SlashCommandBuilder } = require('discord.js');
const { get_guild_info } = require('../utils/get_guild_info');
const { ims_guild_id, imc_guild_id, ima_guild_id, ims_guild_role, imc_guild_role, ima_guild_role, king_role, god_role, divine_role } = require('../constants');

const add_rank_role = async (interaction, rank) => {
    const discord_id = interaction.member.id;
    const guild = interaction.guild;

    if (rank === 'King') {
        interaction.member.roles.add(king_role);
        console.log('    King role added');
    } else if (rank === 'God') {
        interaction.member.roles.add(god_role);
        console.log('    God role added');
    } else if (rank === 'Divine') {
        interaction.member.roles.add(divine_role);
        console.log('    Divine role added');
    }
}

const sync_guild_info = async (interaction, uuid) => {
    const [guild_id, rank] = await get_guild_info(uuid);

    if (guild_id === -1) {
        return;
    }

    const discord_id = interaction.member.id;
    // Check if user is in IMS guild
    if (guild_id === ims_guild_id) {
        console.log(`    ${uuid} is in IMS guild`);

        interaction.member.roles.add(ims_guild_role);
        console.log('    IMS role added');

        add_rank_role(interaction, rank);
        
    } 
    // Check if user is in IMC guild
    if (guild_id === imc_guild_id) {
        console.log(`    ${uuid} is in IMC guild`);

        interaction.member.roles.add(imc_guild_role);
        console.log('    IMC role added');

        add_rank_role(interaction, rank);
    } 
    // Check if user is in IMA guild
    if (guild_id === ima_guild_id) {
        console.log(`    ${uuid} is in IMA guild`);

        interaction.member.roles.add(ima_guild_role);
        console.log('    IMA role added');

        add_rank_role(interaction, rank);
    }
}

const sync_roles_command = new SlashCommandBuilder()
    .setName('sync-roles')
    .setDescription('Syncs your roles with guilds');

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
        await interaction.reply('Error syncing guild info');
    }

    console.log('    Done syncing roles');
    await interaction.reply('Roles synced');
}

module.exports = { sync_guild_info, sync_roles_command, sync_roles_interaction}