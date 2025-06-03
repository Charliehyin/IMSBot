require('dotenv').config();
const { get_uuid_from_ign } = require('../utils/get_uuid_from_ign');
const { SlashCommandBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder, ActionRowBuilder, ModalBuilder, TextInputBuilder, TextInputStyle, PermissionFlagsBits } = require('discord.js');
const { verified_role, embedColor, alerts_channel, cheater_role } = require('../constants');

const setup_verify_command = new SlashCommandBuilder()
    .setName('setup_verify')
    .setDescription('Setup the verify button for the first time')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .setDMPermission(false);

const verify_command = new SlashCommandBuilder()
    .setName('verify')
    .setDescription('Verify a user with their Minecraft IGN')
    .addStringOption(option =>
        option.setName('ign')
            .setDescription('Current linked Minecraft IGN on Hypixel')
            .setRequired(true))

const help_verify_command = new SlashCommandBuilder()
    .setName('help_verify')
    .setDescription('Send the verification help video')
    .setDefaultMemberPermissions(1099511627776);

const help_verify_interaction = async (interaction) => {
    try {
        await interaction.reply({
            files: ['./assets/link_discord.mp4']
        });
        console.log('Sent verification help video')
    } catch (error) {
        console.error('Error showing verification help:', error);
        await interaction.reply({ content: `There was an error while trying to show the verification help: ${error.message}.`});
    }
}

const setup_verify_interaction = async (interaction) => {
    try {
        const embed = new EmbedBuilder()
            .setColor(embedColor)
            .setTitle('Verification')
            .setDescription(`Currently you only have access to certain channels. In order to gain full access you have to verify. To do this:

1) Follow the video below(click the Help button), replacing CrypticPlasma's name with your Discord username.
2) Click on the verify button and type your Minecraft Name to verify! 

Create a ticket **ONLY** if you are still having trouble after waiting a couple of minutes.`);
        
        const guildButtons = new ActionRowBuilder()
            .addComponents(
                new ButtonBuilder()
                    .setCustomId('verify_button')
                    .setLabel('Verify')
                    .setStyle(ButtonStyle.Primary),
                new ButtonBuilder()
                    .setCustomId('verify_help')
                    .setLabel('Help')
                    .setStyle(ButtonStyle.Secondary)
            );

        const message = await interaction.channel.send({ embeds: [embed], components: [guildButtons] });

        await interaction.reply({ content: 'Application button has been set up!', ephemeral: true });
    } catch(error) {
        console.error('Error setting up verify button:', error);
        await interaction.reply({ content: `There was an error while trying to set up the verify button: ${error.message}`, ephemeral: true });
    }
}

const verify_button_interaction = async (interaction, db) => {
    try {
        const modal = new ModalBuilder()
			.setCustomId('verification_form')
			.setTitle('Verification');

		// Create the text input components
		const ign_input = new TextInputBuilder()
			.setCustomId('ign_input')
			.setLabel("What's your Minecraft IGN?")
			.setStyle(TextInputStyle.Short);

		// An action row only holds one text input,
		// so you need one action row per text input.
		const firstActionRow = new ActionRowBuilder().addComponents(ign_input);

		// Add inputs to the modal
		modal.addComponents(firstActionRow);

		// Show the modal to the user
        console.log('Sending verification form')
		await interaction.showModal(modal);
    } catch (error) {
        console.error('Error showing verification form:', error);
        await interaction.reply({ content: `There was an error while trying to show the verification form: ${error.message}.`});
    }
}

const help_button_interaction = async (interaction) => {
    try {
        await interaction.reply({
            files: ['./assets/link_discord.mp4'],
            ephemeral: true
        });
        console.log('Sent verification help video')
    } catch (error) {
        console.error('Error showing verification help:', error);
        await interaction.reply({ content: `There was an error while trying to show the verification help: ${error.message}.`});
    }
}

const verifyMember = async (interaction, discord_username, ign, discord_id, db) => {
    try {
        const key = process.env.HYPIXEL_API_KEY;

        // Get the player's UUID
        const uuid = await get_uuid_from_ign(ign);

        // Check if the UUID is valid
        if (uuid === undefined) {
            return "    Invalid IGN";
        }
        console.log(`    ${ign}'s Minecraft UUID: ${uuid}`);

        // Check if member is blacklisted
        let sql = `SELECT * FROM blacklist WHERE uuid = ? AND cheater = false`;
        let [blacklist_rows] = await db.query(sql, [uuid]);
        if (blacklist_rows.length > 0) {
            // Send a message to the alerts channel
            try {
                const guild = await interaction.client.guilds.fetch(interaction.guild.id);
                const alertsChannel = await guild.channels.fetch(alerts_channel);
                
                const alertEmbed = new EmbedBuilder()
                    .setColor(embedColor)
                    .setTitle('Blacklisted User Attempted Verification')
                    .setDescription(`**User:** <@${discord_id}> (${discord_username})\n**IGN:** ${ign}\n**UUID:** ${uuid}`)
                    .setTimestamp();
                
                await alertsChannel.send({ embeds: [alertEmbed] });
                console.log(`    Sent blacklist alert for ${discord_username} (${ign})`);
            } catch (error) {
                console.error('Error sending blacklist alert:', error);
            }
            return "    You are blacklisted from this server";
        }

        // Check if member is a cheater
        sql = `SELECT * FROM blacklist WHERE uuid = ? AND cheater = true`;
        let cheater = false;
        let [cheater_rows] = await db.query(sql, [uuid]);
        if (cheater_rows.length > 0) {
            cheater = true;
            // Send a message to the alerts channel
            try {
                const guild = await interaction.client.guilds.fetch(interaction.guild.id);
                const alertsChannel = await guild.channels.fetch(alerts_channel);
                
                const alertEmbed = new EmbedBuilder()
                    .setColor(embedColor)
                    .setTitle('Cheater Verified')
                    .setDescription(`**User:** <@${discord_id}> (${discord_username})\n**IGN:** ${ign}\n**UUID:** ${uuid}`)
                    .setTimestamp();
                
                await alertsChannel.send({ embeds: [alertEmbed] });
                console.log(`    Sent cheater alert for ${discord_username} (${ign})`);

                const cheaterRole = await guild.roles.fetch(cheater_role);
                let member = await guild.members.fetch(discord_id);
                await member.roles.add(cheaterRole);
                console.log(`    Added ${cheaterRole.name} role to ${member.user.username}`);
            } catch (error) {
                console.error('Error sending cheater alert:', error);
            }
        }

        // Check if member exists in db
        sql = `SELECT ign FROM members WHERE discord_id = ? AND uuid = ?`;
        let [rows] = await db.query(sql, [discord_id, uuid]);
        if (rows.length > 0) {
            await db.query(`UPDATE members SET ign = ? WHERE discord_id = ?`, [ign, discord_id]);
            console.log("    Member already exists in database");
            return "success" + (cheater ? " (cheater)" : "");
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
        if (!data.player) {
            return "    No player data found on Hypixel"
        }
        if (!data.player.socialMedia) {
            return "    No social media linked on Hypixel"
        }
        if (!data.player.socialMedia.links) {
            return "    No social media links found on Hypixel"
        }
        if (!data.player.socialMedia.links.DISCORD) {
            return "    No discord linked on Hypixel"
        }
        let linked_discord = data.player.socialMedia.links.DISCORD;
        
        // Remove discord tag if exists
        linked_discord = linked_discord.match(/^(.*?)(?:#\d{4})?$/)[1];

        // Check if discord username matches the linked discord account case insensitive
        if (discord_username.toLowerCase() === linked_discord.toLowerCase()){
            console.log("    Updating existing member in database")
            // Check database for whether this member exists in the database
            let sql = `SELECT * FROM members WHERE discord_id = ?`;
            let [rows] = await db.query(sql, [discord_id]);
            if (rows.length > 0) {
                // Update the minecraft ign in the database
                sql = `UPDATE members SET ign = ? WHERE discord_id = ?`;
                await db.query(sql, [ign, discord_id]);
                
                // Update the minecraft uuid in the database
                sql = `UPDATE members SET uuid = ? WHERE discord_id = ?`;
                await db.query(sql, [uuid, discord_id]);

                // TODO: Check if this member is blacklisted or cheater
            } else {
                console.log("    Adding new member to database")
                // Insert the member into the database
                sql = `INSERT INTO members (discord_id, ign, uuid) VALUES (?, ?, ?)`;
                await db.query(sql, [discord_id, ign, uuid]);
            }
            return "success" + (cheater ? " (cheater)" : "");
        } else {
            return `    Linked discord on Hypixel(${linked_discord}) does not match current Discord account(${discord_username})`;
        }
    } catch (error) {
        console.error('Error fetching player data:', error);
        return `    Error fetching player data: ${error.message}`;
    }
}

const verify_interaction = async (interaction, db, opts) => {
    const discord_username = interaction.user.username;
    let ign, ephemeral;
    if (opts) {
        ign = opts.ign;
        ephemeral = true;
    } else {
        ign = interaction.options.getString('ign');
        ephemeral = false;
    }
    const discord_id = interaction.user.id;
    interaction.deferReply({ ephemeral: ephemeral });

    console.log(`Verifying ${discord_username} with IGN ${ign}`)
    try {
        verified = await verifyMember(interaction, discord_username, ign, discord_id, db);

        if (verified.startsWith("success")) {
            // Add verified role to user
            const guild = interaction.guild;
            const role = await guild.roles.fetch(verified_role);
            const member = interaction.member;
            await member.roles.add(role);
            console.log(`    Added ${role.name} role to ${member.user.username}`);

            // Rename user to minecraft ign if bot hoist is higher than member hoist
            if (guild.members.me.roles.highest.comparePositionTo(member.roles.highest) > 0) {
                await member.setNickname(ign);
                console.log(`    Set nickname to ${ign}`);
            }
            else {
                console.log(`    Bot hoist is lower than member hoist, skipping nickname change`);
            }
            if (verified.endsWith(" (cheater)")) {
                await interaction.editReply({ content: `Successfully verified \`${discord_username}\` with IGN \`${ign}\`\n**Note:** This user is a cheater and has been added to the cheater role.`, ephemeral: ephemeral });
            } else {
                await interaction.editReply({ content: `Successfully verified \`${discord_username}\` with IGN \`${ign}\``, ephemeral: ephemeral });
            }
        }
        else {
            console.log(`    Failed to verify ${discord_username} to ${ign} for reason: \n${verified}`)
            await interaction.editReply({ content: `Failed to verify \`${discord_username}\` to \`${ign}\` for reason: \n${verified.trim()}`, ephemeral: ephemeral });
        }
    }
    catch (error) {
        console.error('Error verifying member:', error);
        await interaction.editReply(`There was an error while trying to verify the user: ${error.message}`);
    }
}


module.exports = { 
    verifyMember, 
    verify_command, 
    help_verify_command, 
    help_verify_interaction, 
    verify_interaction, 
    setup_verify_command, 
    setup_verify_interaction, 
    verify_button_interaction, 
    help_button_interaction
}