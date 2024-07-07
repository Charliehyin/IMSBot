const { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const { get_ironman_skyblock_xp } = require('../utils/get_ironman_skyblock_xp');
const { embedColor, IMA_req, IMC_req, IMS_req, APPLICATION_CHANNEL_ID, APPLICATION_MESSAGE_ID, IMS_waitlist, IMC_waitlist, IMA_waitlist, IMS_application_channel, IMC_application_channel, IMA_application_channel } = require('../constants');

const guild_apply_command = new SlashCommandBuilder()
    .setName('guild_apply')
    .setDescription('Apply for a guild')
    .addSubcommand(subcommand =>
        subcommand
            .setName('ironman_sweats')
            .setDescription('Apply for the Ironman Sweats guild'))
    .addSubcommand(subcommand =>
        subcommand
            .setName('ironman_casuals')
            .setDescription('Apply for the Ironman Casuals guild'))
    .addSubcommand(subcommand =>
        subcommand
            .setName('ironman_academy')
            .setDescription('Apply for the Ironman Academy guild'));

const setup_apply_command = new SlashCommandBuilder()
    .setName('setup_apply')
    .setDescription('Setup the guild application button')
    .setDefaultPermission(false);

async function guild_apply_interaction(interaction, db) {
    try {
        console.log('Applying for guild');
        const subcommand = interaction.options.getSubcommand();
        
        // Get UUID from database
        let sql = `SELECT uuid FROM members WHERE discord_id = ?`;
        let [rows] = await db.query(sql, [interaction.user.id]);

        if (rows.length === 0) {
            await interaction.reply({ content: 'You must link your Minecraft account before applying for a guild', ephemeral: true });
            return;
        }

        const uuid = rows[0].uuid;

        // Check if user is on blacklist
        sql = `SELECT * FROM blacklist WHERE uuid = ?`;
        [rows] = await db.query(sql, [uuid]);

        if (rows.length > 0 && rows[0].cheater) {
            await interaction.reply({ content: `You are on the blacklist and cannot apply for a guild. \nReason: ${rows[0].reason}`, ephemeral: true });
            return;
        }

        // Check skyblock xp
        const skyblock_xp = await get_ironman_skyblock_xp(uuid);

        let requiredXp, guildName;
        switch (subcommand) {
            case 'ironman_sweats':
                requiredXp = IMS_req * 100;
                guildName = 'Ironman Sweats';
                break;
            case 'ironman_casuals':
                requiredXp = IMC_req * 100;
                guildName = 'Ironman Casuals';
                break;
            case 'ironman_academy':
                requiredXp = IMA_req * 100;
                guildName = 'Ironman Academy';
                break;
        }

        if (skyblock_xp < requiredXp) {
            await interaction.reply({ content: `You must be Skyblock Level ${requiredXp / 100} to apply for ${guildName}`, ephemeral: true });
            return;
        }

        // Here you would implement the actual application process
        await interaction.reply({ content: `You have applied for ${guildName} (application process not yet implemented)`, ephemeral: true });

    } catch (error) {
        console.error('Error applying for guild:', error);
        await interaction.reply({ content: `An error occurred while applying for a guild: ${error.message}`, ephemeral: true });
    }
}

async function setup_apply_interaction(interaction) {
    const embed = new EmbedBuilder()
        .setColor(embedColor)
        .setTitle('Guild Application')
        .setDescription('Click the button below to apply for a guild!');

    const row = new ActionRowBuilder()
        .addComponents(
            new ButtonBuilder()
                .setCustomId('apply_button')
                .setLabel('Apply')
                .setStyle(ButtonStyle.Primary),
        );

    const message = await interaction.channel.send({ embeds: [embed], components: [row] });
    
    // Save the new message ID and channel ID
    console.log(message.id);
    console.log(interaction.channelId);

    await interaction.reply({ content: 'Application button has been set up!', ephemeral: true });
}

async function handle_apply_button(interaction, db) {
    // Check eligibility (similar to guild_apply_interaction)
    let sql = `SELECT uuid FROM members WHERE discord_id = ?`;
    let [rows] = await db.query(sql, [interaction.user.id]);

    if (rows.length === 0) {
        await interaction.reply({ content: 'You must link your Minecraft account before applying for a guild', ephemeral: true });
        return;
    }

    const uuid = rows[0].uuid;

    sql = `SELECT * FROM blacklist WHERE uuid = ?`;
    [rows] = await db.query(sql, [uuid]);

    if (rows.length > 0 && rows[0].cheater) {
        await interaction.reply({ content: `You are on the blacklist and cannot apply for a guild. \nReason: ${rows[0].reason}`, ephemeral: true });
        return;
    }

    // Create buttons for each guild
    const guildButtons = new ActionRowBuilder()
        .addComponents(
            new ButtonBuilder()
                .setCustomId('apply_ironman_sweats')
                .setLabel('Ironman Sweats')
                .setStyle(ButtonStyle.Primary),
            new ButtonBuilder()
                .setCustomId('apply_ironman_casuals')
                .setLabel('Ironman Casuals')
                .setStyle(ButtonStyle.Primary),
            new ButtonBuilder()
                .setCustomId('apply_ironman_academy')
                .setLabel('Ironman Academy')
                .setStyle(ButtonStyle.Primary)
        );

    await interaction.reply({ content: 'Choose a guild to apply for:', components: [guildButtons], ephemeral: true });
}

async function handle_guild_selection(interaction, db, client) {
    const guildName = interaction.customId.replace('apply_', '');
    const uuid = (await db.query(`SELECT uuid FROM members WHERE discord_id = ?`, [interaction.user.id]))[0][0].uuid;
    const ign = (await db.query(`SELECT ign FROM members WHERE discord_id = ?`, [interaction.user.id]))[0][0].ign;
    const member = await interaction.guild.members.fetch(interaction.user.id);
    const skyblock_xp = await get_ironman_skyblock_xp(uuid);

    let requiredXp, guildReq;
    switch (guildName) {
        case 'ironman_sweats':
            requiredXp = IMS_req * 100;
            guildReq = IMS_req;
            break;
        case 'ironman_casuals':
            requiredXp = IMC_req * 100;
            guildReq = IMC_req;
            break;
        case 'ironman_academy':
            requiredXp = IMA_req * 100;
            guildReq = IMA_req;
            break;
    }

    if (skyblock_xp < requiredXp) {
        await interaction.reply({ content: `You must be Skyblock Level ${guildReq} to apply for ${guildName.replace('_', ' ')}`, ephemeral: true });
        return;
    }

    let applyMessage;
    switch(guildName) {
        case 'ironman_sweats':
            // Application process for Ironman Sweats
            const channel = await client.channels.fetch(IMS_application_channel);
            applyMessage = await channel.send(`${ign} (${member}) has applied for Ironman Sweats!`)

            break;
        case 'ironman_casuals':
            // Application process for Ironman Casuals
            break;
        case 'ironman_academy':
            // Application process for Ironman Academy
    }

    const ApplicationActions = new ActionRowBuilder()
        .addComponents(
            new ButtonBuilder()
                .setCustomId('accept')
                .setLabel('Accept')
                .setStyle(ButtonStyle.Success),
            new ButtonBuilder()
                .setCustomId('reject')
                .setLabel('Reject')
                .setStyle(ButtonStyle.Danger)
        );

    await applyMessage.edit({ components: [ApplicationActions] });

    const collector = applyMessage.createMessageComponentCollector();
      
    let waitlist_message;
    collector.on('collect', async i => {
        if (i.customId === 'accept') {
            // add the user to the waitlist
            switch(guildName) {
                case 'ironman_sweats':
                    const channel = await client.channels.fetch(IMS_application_channel);
                    const waitlist_channel = await client.channels.fetch(IMS_waitlist);
                    waitlist_message = await waitlist_channel.send(`${ign}(${i.user})`);
                    channel.send(`${ign} (${i.user}) has been accepted by ${i.user}!`);
                    break;
                case 'ironman_casuals':
                    break;
                case 'ironman_academy':
                    break;
            }

            const WaitlistActions = new ActionRowBuilder()
                .addComponents(
                    new ButtonBuilder()
                        .setCustomId('invited')
                        .setLabel('Invited')
                        .setStyle(ButtonStyle.Success),
                    new ButtonBuilder()
                        .setCustomId('ask-to-leave')
                        .setLabel('Ask To Leave Guild')
                        .setStyle(ButtonStyle.Primary)
                );

            await waitlist_message.edit({ components: [WaitlistActions] });

            collector.stop();

            const waitlist_collector = waitlist_message.createMessageComponentCollector();
            waitlist_collector.on('collect', async wi => {
                if (wi.customId === 'invited') {
                    // delete the message
                    await wi.message.delete();
                    console.log("invited");
                } else if (wi.customId === 'ask-to-leave') {
                    console.log("ask-to-leave");
                    // dm the user
                    const dm = await member.createDM();
                    dm.send('Please leave your guild');
                    wi.reply({ content: `${ign} has been asked to leave their guild`, ephemeral: true });
                }
            });

            // delete the message
            await i.message.delete();
            console.log("accept");

        } else if (i.customId === 'reject') {
            console.log("reject");
            await i.message.delete();
        }
    });


    await interaction.reply({ content: `You have applied for ${guildName.replace('_', ' ')} (application process not yet implemented)`, ephemeral: true });
}

async function reestablishApplicationButtons(client) {
    try {
        // Fetch the channel where the application message is supposed to be
        const channel = await client.channels.fetch(APPLICATION_CHANNEL_ID);
        if (!channel) return console.error("Couldn't find the application channel");

        // Try to fetch the existing message
        const message = await channel.messages.fetch(APPLICATION_MESSAGE_ID);
        
        // If the message exists, update its components
        const embed = new EmbedBuilder()
            .setColor(embedColor)
            .setTitle('Guild Application')
            .setDescription('Click the button below to apply for a guild!');

        const row = new ActionRowBuilder()
            .addComponents(
                new ButtonBuilder()
                    .setCustomId('apply_button')
                    .setLabel('Apply')
                    .setStyle(ButtonStyle.Primary),
            );

        await message.edit({ embeds: [embed], components: [row] });
        console.log('Successfully reestablished application buttons');
    } catch (error) {
        console.error("Couldn't find the application message. You may need to run /setup_apply again.", error);
    }
}

module.exports = {
    guild_apply_command,
    guild_apply_interaction,
    setup_apply_command,
    setup_apply_interaction,
    handle_apply_button,
    handle_guild_selection,
    reestablishApplicationButtons
};