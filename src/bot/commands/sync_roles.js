require('dotenv').config();
const { SlashCommandBuilder } = require('discord.js');
const { get_guild_info } = require('../utils/get_guild_info');
const { check_ironman_hotm4 } = require('../utils/check_ironman_hotm4');
const { ims_guild_id, imc_guild_id, ima_guild_id, ims_guild_role, imc_guild_role, ima_guild_role, king_role, god_role, divine_role, lfp_plus_role, verified_role } = require('../constants');

const add_rank_role = async (rank, roles) => {
    if (rank === 'King') {
        console.log('    King role added');
        roles.push(king_role);
    } else if (rank === 'God') {
        console.log('    God role added');
        roles.push(god_role)
    } else if (rank === 'Divine') {
        console.log('    Divine role added');
        roles.push(divine_role)
    }
    return roles;
}

const sync_guild_info = async (uuid) => {
    const [guild_id, rank] = await get_guild_info(uuid);
    let roles = [verified_role];

    if (guild_id === -1) {
        return roles;
    }

    // Check if user is in IMS guild
    if (guild_id === ims_guild_id) {
        console.log(`    ${uuid} is in IMS guild`);

        console.log('    IMS role added');
        roles.push(ims_guild_role);

        roles = add_rank_role(rank, roles);
    } 
    // Check if user is in IMC guild
    if (guild_id === imc_guild_id) {
        console.log(`    ${uuid} is in IMC guild`);

        console.log('    IMC role added');
        roles.push(imc_guild_role);

        roles = add_rank_role(rank, roles);
    } 
    // Check if user is in IMA guild
    if (guild_id === ima_guild_id) {
        console.log(`    ${uuid} is in IMA guild`);

        console.log('    IMA role added');
        roles.push(ima_guild_role);

        roles = add_rank_role(rank, roles);
    }
    return roles;
}

const sync_roles_command = new SlashCommandBuilder()
    .setName('sync-roles')
    .setDescription('Syncs your roles with guilds');

const sync_roles_interaction = async (interaction, db) => {
    console.log('Syncing roles')
    interaction.deferReply();
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

        // Get roles the user should have
        let roles = await sync_guild_info(uuid);
        console.log('    Guild roles synced')

        // Check if user is ironman in HOTM4
        const ironman = await check_ironman_hotm4(uuid);

        if (ironman) {
            console.log('    lfp plus role');
            roles.push(lfp_plus_role);
        }

        // Fetch the member's current roles
        const memberRoles = interaction.member.roles.cache;
        const rolesToSync = [ims_guild_role, imc_guild_role, ima_guild_role, king_role, god_role, divine_role, lfp_plus_role, verified_role]

        // Remove roles that the member shouldn't have
        let rolesToRemove = [];
        for (const role of memberRoles.keys()) {
            if (!roles.includes(role) && rolesToSync.includes(role)) {
                rolesToRemove.push(role);
                console.log(`    Removing role: ${role}`);
            }
        }

        // Define the roles that should be added
        const rolesToAdd = [];
        for (const role of roles) {
            if (!memberRoles.has(role)) {
                rolesToAdd.push(role);
                console.log(`    Adding role: ${role}`);
            }
        }

        await Promise.all([
            ...rolesToAdd.map(role => interaction.member.roles.add(role)),
            ...rolesToRemove.map(role => interaction.member.roles.remove(role))
        ]);

        let reply = '';
        if (rolesToAdd.length > 0) {
            console.log('    Adding roles: ' + rolesToAdd.map((role) => '<@&' + role + '>').join(', '));
            reply += 'Adding: ' + rolesToAdd.map((role) => '<@&' + role + '>').join(', ') + '\n';
        }
        if (rolesToRemove.length > 0) {
            console.log('    Removing roles: ' + rolesToRemove.map((role) => '<@&' + role + '>').join(', '));
            reply += 'Removing: ' + rolesToRemove.map((role) => '<@&' + role + '>').join(', ') + '\n';
        }
        if (reply === '') {
            reply = 'No roles to add or remove';
        }

        console.log('    Done syncing roles');
        await interaction.editReply(reply);

    } catch (error) {
        console.error('Error syncing guild info:', error);
        await interaction.editReply(`There was an error while trying to sync your roles: ${error.message}`);
    }
}

module.exports = { sync_guild_info, sync_roles_command, sync_roles_interaction}
