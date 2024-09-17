require('dotenv').config();
const { SlashCommandBuilder } = require('discord.js');
const { get_guild_info } = require('../utils/get_guild_info');
const { check_ironman_hotm3 } = require('../utils/check_ironman_hotm3');
const { ims_guild_id, imc_guild_id, ima_guild_id, ims_guild_role, imc_guild_role, ima_guild_role, king_role, god_role, divine_role, lfp_plus_role, verified_role } = require('../constants');

const add_rank_role = async (interaction, rank, roles) => {
    if (rank === 'King') {
        await interaction.member.roles.add(king_role);
        console.log('    King role added');
        roles.push(king_role);
    } else if (rank === 'God') {
        await interaction.member.roles.add(god_role);
        console.log('    God role added');
        roles.push(god_role)
    } else if (rank === 'Divine') {
        await interaction.member.roles.add(divine_role);
        console.log('    Divine role added');
        roles.push(divine_role)
    }
    return roles;
}

const sync_guild_info = async (interaction, uuid) => {
    const [guild_id, rank] = await get_guild_info(uuid);
    let roles = [verified_role];

    if (guild_id === -1) {
        return roles;
    }

    // Check if user is in IMS guild
    if (guild_id === ims_guild_id) {
        console.log(`    ${uuid} is in IMS guild`);

        await interaction.member.roles.add(ims_guild_role);
        console.log('    IMS role added');
        roles.push(ims_guild_role);

        roles = add_rank_role(interaction, rank, roles);
    } 
    // Check if user is in IMC guild
    if (guild_id === imc_guild_id) {
        console.log(`    ${uuid} is in IMC guild`);

        await interaction.member.roles.add(imc_guild_role);
        console.log('    IMC role added');
        roles.push(imc_guild_role);

        roles = add_rank_role(interaction, rank, roles);
    } 
    // Check if user is in IMA guild
    if (guild_id === ima_guild_id) {
        console.log(`    ${uuid} is in IMA guild`);

        await interaction.member.roles.add(ima_guild_role);
        console.log('    IMA role added');
        roles.push(ima_guild_role);

        roles = add_rank_role(interaction, rank, roles);
    }
    return roles;
}

const sync_roles_command = new SlashCommandBuilder()
    .setName('sync-roles')
    .setDescription('Syncs your roles with guilds');

const sync_roles_interaction = async (interaction, db) => {
    console.log('Syncing roles')
    // Sync guild info
    try {
        const discord_id = interaction.member.id;
        console.log(`    discord_id: ${discord_id}`)
        
        // Get uuid from database
        let sql = `SELECT uuid FROM members WHERE discord_id = ?`;
        let [rows] = await db.query(sql, [discord_id]);
        if (rows.length === 0) {
            await interaction.reply('You are not verified');
            return;
        }
        const uuid = rows[0].uuid;

        console.log(`    uuid: ${uuid}, discord_id: ${discord_id}`)

        await interaction.member.roles.remove([king_role, god_role, divine_role, ims_guild_role, imc_guild_role, ima_guild_role, lfp_plus_role]);
        console.log('    Old roles removed');

        await interaction.member.roles.add(verified_role);

        let roles = await sync_guild_info(interaction, uuid);
        console.log('    Guild roles synced')

        // Check if user is ironman in HOTM3
        const ironman = await check_ironman_hotm3(uuid);

        if (ironman) {
            await interaction.member.roles.add(lfp_plus_role);
            console.log('    lfp plus role added');
            roles.push(lfp_plus_role);
        }
        
        console.log('    Done syncing roles');
        await interaction.reply('Roles synced: ' + roles.map((role) => '<@&' + role + '>').join(', '));

    } catch (error) {
        console.error('Error syncing guild info:', error);
        await interaction.reply(`There was an error while trying to sync your roles: ${error.message}`);
    }
}

module.exports = { sync_guild_info, sync_roles_command, sync_roles_interaction}
