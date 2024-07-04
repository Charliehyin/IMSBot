require('dotenv').config();
const { embedColor } = require('../constants');
const { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const { get_uuid_from_ign } = require('../utils/get_uuid_from_ign');
const itemsPerPage = 2;

// Create the main command
const blacklist_command = new SlashCommandBuilder()
    .setName('blacklist')
    .setDescription('Manage the blacklist')
    .setDefaultMemberPermissions(1099511627776)
    .addSubcommand(subcommand =>
        subcommand
            .setName('remove')
            .setDescription('Remove a user from the blacklist')
            .addStringOption(option =>
                option.setName('uuid')
                    .setDescription('uuid of the user to remove')
                    .setRequired(true)))
    .addSubcommand(subcommand =>
        subcommand
            .setName('add')
            .setDescription('Add a user to the blacklist')
            .addStringOption(option =>
                option.setName('ign')
                    .setDescription('ign of the user to blacklist')
                    .setRequired(true))
            .addStringOption(option =>
                option.setName('reason')
                    .setDescription('reason for blacklisting the user')
                    .setRequired(true))
            .addBooleanOption(option =>
                option.setName('cheater')
                    .setDescription('is the user a cheater')
                    .setRequired(true)))
    .addSubcommand(subcommand =>
        subcommand
            .setName('search')
            .setDescription('Search all blacklisted users for an ign')
            .addStringOption(option =>
                option.setName('ign_uuid')
                    .setDescription('ign or uuid of the user to search for')
                    .setRequired(true)))
    .addSubcommand(subcommand =>
        subcommand
            .setName('view')
            .setDescription('View all blacklisted users'));



const blacklist_interaction = async (interaction, db) => {
    try {
        const subcommand = interaction.options.getSubcommand();

        if (subcommand === 'add') {
            console.log('Adding user to blacklist')
            const ign = interaction.options.getString('ign');
            const reason = interaction.options.getString('reason');
            const cheater = interaction.options.getBoolean('cheater');

            const uuid = await get_uuid_from_ign(ign);
            console.log(`    UUID: ${uuid}`)

            // Check if the user exists in the database
            let sql = `SELECT * FROM blacklist WHERE uuid = ?`;
            let [rows] = await db.query(sql, [uuid]);
            if (rows.length > 0) {
                console.log(`    User is already blacklisted.`)
                await interaction.reply(`User with UUID ${uuid} is already blacklisted.`);
                return;
            }

            // Add the user to the blacklist
            sql = `INSERT INTO blacklist (discord_id, uuid, reason, cheater, time_stamp, ign) VALUES (?, ?, ?, ?, ?, ?)`;
            await db.query(sql, [interaction.user.id, uuid, reason, cheater, Math.floor(interaction.createdTimestamp/1000), ign ]);
            console.log(`    User added to blacklist`)

            await interaction.reply(`User ${ign} has been blacklisted for reason: ${reason}. Cheater status: ${cheater}`);
        } 
        else if (subcommand === 'remove') {
            console.log('Removing user from blacklist')

            const uuid = interaction.options.getString('uuid');

            // Check if the user exists in the database
            let sql = `SELECT * FROM blacklist WHERE uuid = ?`;
            let [rows] = await db.query(sql, [uuid]);
            if (rows.length === 0) {
                console.log(`    User is not blacklisted.`)
                await interaction.reply(`User is not blacklisted.`);
                return;
            }

            // Remove the user from the blacklist
            sql = `DELETE FROM blacklist WHERE uuid = ?`;
            await db.query(sql, [uuid]);
            console.log(`    User removed from blacklist`)

            await interaction.reply(`User with UUID ${uuid} has been removed from the blacklist.`);
        }
        else if (subcommand === 'search') {
            console.log('Searching blacklist')

            let ign_uuid = interaction.options.getString('ign_uuid');

            // Check if the user exists in the database
            let sql = `SELECT * FROM blacklist WHERE LOWER(ign) LIKE ?`;
            let searchString = `%${ign_uuid.toLowerCase()}%`;
            let [rows] = await db.query(sql, [searchString]);

            sql = `SELECT * FROM blacklist WHERE uuid = ?`;
            ign_uuid = ign_uuid.replace(/-/g, '');
            let [more_rows] = await db.query(sql, [ign_uuid]);

            rows = rows.concat(more_rows);

            if (rows.length === 0) {
                console.log(`    No users found in blacklist.`)
                await interaction.reply(`No users found in blacklist.`);
                return;
            }

            // Display the users found in the blacklist with an embed
            const embed = new EmbedBuilder()
                .setTitle('Blacklisted Users')
                .setDescription(`Users found in blacklist matching "${ign_uuid}"`)
                .setColor(embedColor);

            // Add each user to the embed
            rows.forEach(row => {
                embed.addFields(
                    { name: 'IGN', value: row.ign, inline: true },
                    { name: 'Reason', value: row.reason, inline: true },
                    { name: 'Cheater', value: row.cheater ? 'Yes' : 'No', inline: true },
                );
            });

            await interaction.reply({ embeds: [embed] });
        }
        else if (subcommand === 'view') {
            console.log('Viewing blacklist')

            // Get all blacklisted users
            let sql = `SELECT * FROM blacklist`;
            let [rows] = await db.query(sql);

            if (rows.length === 0) {
                console.log(`    No users found in blacklist.`)
                await interaction.reply(`No users found in blacklist.`);
                return;
            }

            const pages = [];
        
            for (let i = 0; i < rows.length; i += itemsPerPage) {
                const pageRows = rows.slice(i, i + itemsPerPage);
                const embed = new EmbedBuilder()
                    .setTitle('Blacklisted Users')
                    .setDescription(`All users found in the blacklist`)
                    .setColor(embedColor)
                    .setFooter({ text: `Page ${pages.length + 1}/${Math.ceil(rows.length / itemsPerPage)}` });
        
                let igns = '';
                let reasons = '';
                let cheaters = '';
        
                pageRows.forEach(row => {

                    igns += `${row.ign}\n`;
                    if (row.reason.length > 50) {
                        reasons += `${row.reason.substring(0, 50)}...\n`;
                    }
                    else {
                        reasons += `${row.reason}\n`;
                    }
                    cheaters += row.cheater ? 'Yes\n' : 'No\n';
                });
        
                embed.addFields(
                    { name: "ign", value: igns, inline: true },
                    { name: "reason", value: reasons, inline: true },
                    { name: "cheater", value: cheaters, inline: true }
                );
        
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
        
            const response = await interaction.reply({
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
    } catch (error) {
        console.error('Error managing blacklist:', error);
        await interaction.reply(`There was an error while trying to manage the blacklist: ${error.message}`);
    }
}

module.exports = { blacklist_command, blacklist_interaction };
