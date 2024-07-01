require('dotenv').config();
const { get_uuid_from_ign } = require('../utils/get_uuid_from_ign');
const { SlashCommandBuilder } = require('discord.js');
const { verified_role } = require('../constants');

const verifyMember = async (discord_username, ign, discord_id, db) => {
    try {
        const key = process.env.HYPIXEL_API_KEY;

        // Get the player's UUID
        const uuid = await get_uuid_from_ign(ign);

        // Check if the UUID is valid
        if (uuid === undefined) {
            return "    Invalid IGN";
        }
        console.log(`    ${ign}'s Minecraft UUID: ${uuid}`);

        // Check if member exists in db
        let sql = `SELECT ign FROM members WHERE discord_id = ? AND uuid = ?`;
        let [rows] = await db.query(sql, [discord_id, uuid]);
        if (rows.length > 0) {
            db.query(`UPDATE members SET discord_username = ?, ign = ? WHERE discord_id = ?`, [discord_username, ign, discord_id])
            console.log("    Member already exists in database")
            return true;
        }

        const discord_url = `https://api.hypixel.net/v2/player?key=${key}&uuid=${uuid}`;

        const fetch = (await import('node-fetch')).default;

        const resp = await fetch(discord_url, {
            method: "GET",
            headers: {
                "Content-Type": "application/json", 
            }
        });

        if (!resp.ok) {
            return "    Error fetching player data from Hypixel API"
        }

        const data = await resp.json();
        let linked_discord = data.player.socialMedia.links.DISCORD;
        // Remove discord tag if exists
        linked_discord = linked_discord.match(/^(.*?)(?:#\d{4})?$/)[1];

        // Check if discord username matches the linked discord account case insensitive
        if (discord_username.toLowerCase() === linked_discord.toLowerCase()){
            console.log("    Updating existing member in database")
            // Check database for whether this member exists in the database
            let sql = `SELECT discord_username FROM members WHERE discord_id = ?`;
            let [rows] = await db.query(sql, [discord_id]);
            if (rows.length > 0) {
                // Update the minecraft ign in the database
                sql = `UPDATE members SET ign = ? WHERE discord_id = ?`;
                db.query(sql, [ign, discord_id]);
                
                // Update the minecraft uuid in the database
                sql = `UPDATE members SET uuid = ? WHERE discord_id = ?`;
                db.query(sql, [uuid, discord_id]);

                // TODO: Check if this member is blacklisted or cheater
            } else {
                console.log("    Adding new member to database")
                // Insert the member into the database
                sql = `INSERT INTO members (discord_id, discord_username, ign, uuid) VALUES (?, ?, ?, ?)`;
                db.query(sql, [discord_id, discord_username, ign, uuid]);
            }
            return true;
        } else {
            return `    Linked discord on Hypixel(${linked_discord}) does not match current Discord account(${discord_username})`;
        }
    } catch (error) {
        console.error('Error fetching player data:', error);
    }
}

const verify_command = new SlashCommandBuilder()
.setName('verify')
.setDescription('Verify a user with their Minecraft IGN')
.addStringOption(option =>
    option.setName('ign')
        .setDescription('Current linked Minecraft IGN on Hypixel')
        .setRequired(true))

const verify_interaction = async (interaction, db) => {
    const discord_username = interaction.user.username;
    const ign = interaction.options.getString('ign');
    const discord_id = interaction.user.id;

    console.log(`Verifying ${discord_username} with IGN ${ign}`)
    try {
        verified = await verifyMember(discord_username, ign, discord_id, db);

        if (verified === true) {
            // Add verified role to user
            const guild = interaction.guild;
            const role = guild.roles.cache.get(verified_role);
            const member = interaction.member;
            member.roles.add(role);
            console.log(`    Added ${role.name} role to ${member.user.username}`);

            // Rename user to minecraft ign if bot hoist is higher than member hoist
            if (guild.members.me.roles.highest.comparePositionTo(member.roles.highest) > 0) {
                member.setNickname(ign);
                console.log(`    Set nickname to ${ign}`);
            }
            else {
                console.log(`    Bot hoist is lower than member hoist, skipping nickname change`);
            }

            await interaction.reply(`Successfully verified \`${discord_username}\` with IGN \`${ign}\``);
        }
        else {
            console.log(`    Failed to verify ${discord_username} to ${ign} for reason: \n${verified}`)
            await interaction.reply(`Failed to verify \`${discord_username}\` to \`${ign}\` for reason: \n${verified.strip()}`);
        }
    }
    catch (error) {
        console.error('Error verifying member:', error);
    }
}


module.exports = { verifyMember, verify_command, verify_interaction }