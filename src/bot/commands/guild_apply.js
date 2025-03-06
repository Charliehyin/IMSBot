const { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, PermissionFlagsBits, ChannelType  } = require('discord.js');
const { get_ironman_skyblock_xp } = require('../utils/get_ironman_skyblock_xp');
const { 
    embedColor, 
    IMA_req, 
    IMC_req, 
    IMS_req, 
    IMS_waitlist, 
    IMC_waitlist, 
    IMA_waitlist, 
    IMS_application_channel, 
    IMC_application_channel, 
    IMA_application_channel,
    IMS_application_category,
    IMC_application_category,
    IMA_application_category,
    ims_staff_role,
    imc_staff_role,
    ima_staff_role
} = require('../constants');

const setup_apply_command = new SlashCommandBuilder()
    .setName('setup_apply')
    .setDescription('Setup the guild application button')
    .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers)
    .setDMPermission(false)
    .addBooleanOption(option =>
        option.setName('ims_closed')
        .setDescription('If Ironman Sweats is closed'))
    .addBooleanOption(option =>
        option.setName('imc_closed')
        .setDescription('If Ironman Casuals is closed'))
    .addBooleanOption(option =>
        option.setName('ima_closed')
        .setDescription('If Ironman Academy is closed'));

const check_permissions = async (interaction) => {
    try {
        const member = await interaction.guild.members.fetch(interaction.user.id);
        if (!member.permissions.has(PermissionFlagsBits.ModerateMembers)) {
            console.log('User does not have permission to use this button')
            await interaction.reply({ content: 'You do not have permission to use this button', ephemeral: true });
            return false;
        }
        return true;
    } catch (error) {
        console.error('Error checking permissions:', error);
        return false;
    }
}

const setup_apply_interaction = async (interaction) => {
        try {
        const embed = new EmbedBuilder()
            .setColor(embedColor)
            .setTitle('Guild Applications')
            .setDescription(`Click the button below to apply for a guild!

                **Note:** You must verify your Minecraft account before applying for a guild.

                Universal Guild Requirements:
- Ironman
- All APIs enabled
- Private Island/Garden visits enabled for guild members
- Kicked after 7+ days of inactivity

                IMS Requirement: Skyblock level **${IMS_req}**
                IMC Requirement: Skyblock level **${IMC_req}**
                IMA Requirement: Skyblock level **${IMA_req}**
                
                You may view the waitlists for each guild in <#${IMS_waitlist}>, <#${IMC_waitlist}>, and <#${IMA_waitlist}>.
                
                **Please do not apply for multiple guilds at once.**`);

        let IMS_button = new ButtonBuilder()
            .setCustomId('apply_ironman_sweats')
            .setLabel('Ironman Sweats')
            .setStyle(ButtonStyle.Primary);

        let IMC_button = new ButtonBuilder()
            .setCustomId('apply_ironman_casuals')
            .setLabel('Ironman Casuals')
            .setStyle(ButtonStyle.Primary);
        
        let IMA_button = new ButtonBuilder()
            .setCustomId('apply_ironman_academy')
            .setLabel('Ironman Academy')
            .setStyle(ButtonStyle.Primary);

        if (interaction.options.getBoolean('ims_closed')) {
            IMS_button = IMS_button.setDisabled(true);
            IMS_button = IMS_button.setLabel('Ironman Sweats (Closed)');
        }

        if (interaction.options.getBoolean('imc_closed')) {
            IMC_button = IMC_button.setDisabled(true);
            IMC_button = IMC_button.setLabel('Ironman Casuals (Closed)');
        }

        if (interaction.options.getBoolean('ima_closed')) {
            IMA_button = IMA_button.setDisabled(true);
            IMA_button = IMA_button.setLabel('Ironman Academy (Closed)');
        }
        
        const guildButtons = new ActionRowBuilder()
            .addComponents(
                IMS_button,
                IMC_button,
                IMA_button
            );

        const message = await interaction.channel.send({ embeds: [embed], components: [guildButtons] });
        
        // Save the new message ID and channel ID
        console.log(message.id);
        console.log(interaction.channelId);

        await interaction.reply({ content: 'Application button has been set up!', ephemeral: true });
    } catch (error) {
        console.error('Error setting up apply button:', error);
        interaction.reply({ content: `An error occurred while setting up the apply button: ${error.message}`, ephemeral: true });
    }
}

const create_application = async (interaction, db, client, member, ign, application_channel, staff_role, application_category, guildName) => {
    try {
        const channel = await client.channels.fetch(application_channel);
        const applyMessage = await channel.send(`<@&${staff_role}>\n[${ign}](https://sky.shiiyu.moe/stats/${ign}) (${member}) has applied for ${guildName}!`);

        // Create a new channel in application_category
        const application = await interaction.guild.channels.create({
            name: `application-${ign}`,
            type: ChannelType.GuildText,
            parent: application_category,
            permissionOverwrites: null
        });

        await application.permissionOverwrites.create(interaction.guild.id, { ViewChannel: false });
        await application.permissionOverwrites.create(member.id, { ViewChannel: true });
        await application.permissionOverwrites.create(staff_role, { ViewChannel: true });


        // Send a message in the new channel
        await application.send(`Welcome to your application channel, ${member}!`);

        return { applyMessage, channelId: application.id };

    } catch (error) {
        console.error('Error creating application:', error);
        return null;
    }
}

const handle_guild_selection = async (interaction, db, client) => {
    try {
        console.log('Applying for guild')
        await interaction.deferReply({ ephemeral: true });
        let sql = `SELECT uuid FROM members WHERE discord_id = ?`;
        let [rows] = await db.query(sql, [interaction.user.id]);

        if (rows.length === 0) {
            await interaction.editReply({ content: 'You must link your Minecraft account before applying for a guild' });
            return;
        }

        const uuid = rows[0].uuid;

        sql = `SELECT * FROM blacklist WHERE uuid = ?`;
        [rows] = await db.query(sql, [uuid]);

        if (rows.length > 0) {
            await interaction.editReply({ content: `You are on the blacklist and cannot apply for a guild. \nReason: ${rows[0].reason}` });
            return;
        }

        const guildName = interaction.customId.replace('apply_', '').replace('_', ' ').replace('ironman', 'Ironman').replace('sweats', 'Sweats').replace('casuals', 'Casuals').replace('academy', 'Academy');
        const ign = (await db.query(`SELECT ign FROM members WHERE discord_id = ?`, [interaction.user.id]))[0][0].ign;
        const member = await interaction.guild.members.fetch(interaction.user.id);
        const skyblock_xp = await get_ironman_skyblock_xp(uuid);

        let requiredXp, guildReq;
        switch (guildName) {
            case 'Ironman Sweats':
                requiredXp = IMS_req * 100;
                guildReq = IMS_req;
                break;
            case 'Ironman Casuals':
                requiredXp = IMC_req * 100;
                guildReq = IMC_req;
                break;
            case 'Ironman Academy':
                requiredXp = IMA_req * 100;
                guildReq = IMA_req;
                break;
        }

        console.log(`    User ${ign} is applying for ${guildName}`)
        console.log(`    User ${ign} has Skyblock XP: ${skyblock_xp}`)

        if (skyblock_xp < requiredXp) {
            await interaction.editReply({ content: `You must be Skyblock Level ${guildReq} to apply for ${guildName.replace('_', ' ')}` });
            console.log(`    User ${ign} does not meet the requirements for ${guildName}`);
            return;
        }

        // Check if the user already has an open application
        sql = `SELECT * FROM applications WHERE ign = LOWER(?) AND application_status = 'open'`;
        [rows] = await db.query(sql, [ign.toLowerCase()]);

        if (rows.length > 0) {
            await interaction.editReply({ content: `You already have an open application for ${rows[0].guild}. Please wait for a response.` });
            console.log(`    User ${ign} already has an open application for ${rows[0].guild}`);
            return;
        }

        let applyMessage, channelId;
        switch(guildName) {
            case 'Ironman Sweats':
                ({ applyMessage, channelId } = await create_application(interaction, db, client, member, ign, IMS_application_channel, ims_staff_role, IMS_application_category, guildName));
                break;
            case 'Ironman Casuals':
                ({applyMessage, channelId} = await create_application(interaction, db, client, member, ign, IMC_application_channel, imc_staff_role, IMC_application_category, guildName));
                break;
            case 'Ironman Academy':
                ({applyMessage, channelId} = await create_application(interaction, db, client, member, ign, IMA_application_channel, ima_staff_role, IMA_application_category, guildName));
                break;    
        }

        if (applyMessage === null) {
            await interaction.editReply({ content: `An error occurred while applying for the guild: ${error.message}\nPlease make a ticket. ` });
            return;
        }
        console.log(`    Application channel has been created: ${channelId}`)

        // Add the application to the database
        sql = `INSERT INTO applications (uuid, ign, discord_id, guild, application_channel, application_status, time_stamp) VALUES (?, ?, ?, ?, ?, 'open', ?)`;
        await db.query(sql, [uuid, ign, interaction.user.id, guildName, channelId, Math.floor(interaction.createdTimestamp/1000)]);
        console.log(`    Application has been added to the database`)

        const ApplicationActions = new ActionRowBuilder()
            .addComponents(
                new ButtonBuilder()
                    .setCustomId('guild_accept')
                    .setLabel('Accept')
                    .setStyle(ButtonStyle.Success),
                new ButtonBuilder()
                    .setCustomId('guild_reject')
                    .setLabel('Reject')
                    .setStyle(ButtonStyle.Danger)
            );

        await applyMessage.edit({ components: [ApplicationActions] });

        await interaction.editReply({ content: `You have successfully applied for ${guildName.replace('_', ' ')}. <#${channelId}>` });
    } catch (error) {
        console.error('Error applying for guild:', error);
        await interaction.editReply({ content: `An error occurred while applying for the guild: ${error.message}` });
    }
}

const get_application_message_content = (interaction) => {
    try {
        let content = interaction.message.content;
        const ign = content.match(/\[(.*?)\]/)[1];
        const userid = content.match(/<@(\d*?)>/)[1];
        const channelid = interaction.message.channel.id;
        let guildName;
        if (channelid === IMS_application_channel) {
            guildName = 'Ironman Sweats';
        } else if (channelid === IMC_application_channel) {
            guildName = 'Ironman Casuals';
        } else if (channelid === IMA_application_channel) {
            guildName = 'Ironman Academy';
        } else {
            throw new Error('Invalid channel');
        }
        return { ign, userid, guildName };
    } catch (error) {
        console.error('Error getting application message content:', error);
        return null;
    }
}

const get_waitlist_message_content = (interaction) => {
    try {
        let content = interaction.message.content;
        const ign = content.split(" ")[0];
        const userid = content.match(/<@(\d*?)>/)[1];
        const channelid = interaction.message.channel.id;
        let guildName;
        if (channelid === IMS_waitlist) {
            guildName = 'Ironman Sweats';
        } else if (channelid === IMC_waitlist) {
            guildName = 'Ironman Casuals';
        } else if (channelid === IMA_waitlist) {
            guildName = 'Ironman Academy';
        } else {
            throw new Error('Invalid channel');
        }
        return { ign, userid, guildName };
    } catch (error) {
        console.error('Error getting waitlist message content:', error);
        return null;
    }
}

const handle_guild_accept = async (interaction, db, client) => {
    try {
        console.log('Accepting user');
        // message format: ign (<@user>) has applied for Ironman Sweats!
        const { ign, userid, guildName } = get_application_message_content(interaction);
        const member = await interaction.guild.members.fetch(userid);

        let waitlist_message, channel, waitlist_channel;
        const dm = await member.createDM();

        console.log(`    Accepting ${ign} into ${guildName}`)

        // fetch the application channel from the database
        let sql = `SELECT application_channel FROM applications WHERE ign = LOWER(?) AND guild = ? AND application_status = 'open'`;
        let [rows] = await db.query(sql, [ign.toLowerCase(), guildName]);
        if (rows.length === 0) {
            console.log('    No open application found');
            return;
        }

        let application_channel = rows[0].application_channel;
        let accepted_message = `You have been accepted into ${guildName}. You are now on the waitlist.

Before joining the guild make sure that you:
- Enable visits for both island and garden (stand on each island and enable them to guild members or anyone)
- Ensure you keep your APIs on at all times
- Make sure to set /mystatus online
- Read <#930986320225005598>
- IF YOU HAVE MULTIPLE IRONMAN PROFILES - ENABLE API'S ON ALL OF THEM

If you are inactive for longer than 7 days you will be kicked.

If you miss the invite - be patient, you will be reinvited. DO NOT MAKE A TICKET\n`;

        // add the user to the waitlist
        switch(guildName) {
            case 'Ironman Sweats':
                channel = await client.channels.fetch(IMS_application_channel);
                waitlist_channel = await client.channels.fetch(IMS_waitlist);
                waitlist_message = await waitlist_channel.send(`${ign} (<@${userid}>) <#${application_channel}>`);

                channel.send(`${ign} (<@${userid}>) has been accepted by ${interaction.user}!`);
                accepted_message += `<#${IMS_waitlist}>`;
                break;
            case 'Ironman Casuals':
                channel = await client.channels.fetch(IMC_application_channel);
                waitlist_channel = await client.channels.fetch(IMC_waitlist);
                waitlist_message = await waitlist_channel.send(`${ign} (<@${userid}>) <#${application_channel}>`);

                channel.send(`${ign} (<@${userid}>) has been accepted by ${interaction.user}!`);
                accepted_message += `<#${IMC_waitlist}>`;
                break;
            case 'Ironman Academy':
                channel = await client.channels.fetch(IMA_application_channel);
                waitlist_channel = await client.channels.fetch(IMA_waitlist);
                waitlist_message = await waitlist_channel.send(`${ign} (<@${userid}>) <#${application_channel}>`);

                channel.send(`${ign} (<@${userid}>) has been accepted by ${interaction.user}!`);
                accepted_message += `<#${IMA_waitlist}>`;
                break;
        }

        accepted_message += `\n<@${userid}>`;

        const WaitlistActions = new ActionRowBuilder()
            .addComponents(
                new ButtonBuilder()
                    .setCustomId('guild_invited')
                    .setLabel('Close Application')
                    .setStyle(ButtonStyle.Success),
                new ButtonBuilder()
                    .setCustomId('guild_ask_to_leave')
                    .setLabel('Ask To Leave Guild')
                    .setStyle(ButtonStyle.Primary),
                new ButtonBuilder()
                    .setCustomId('guild_notify_invited')
                    .setLabel('Notify Invited')
                    .setStyle(ButtonStyle.Primary)
            );

        await waitlist_message.edit({ components: [WaitlistActions] });

        // Update database status
        sql = `UPDATE applications SET application_status = 'accepted' WHERE ign = LOWER(?) AND guild = ? AND application_status = 'open'`;
        [rows] = await db.query(sql, [ign.toLowerCase(), guildName]);
        if (rows.affectedRows === 0) {
           console.log('    No open application found');
        }

        // dm the user and send a message in the application channel
        application_channel = await client.channels.fetch(application_channel);
        dm.send(accepted_message);
        application_channel.send(accepted_message);

        // delete the message
        await interaction.message.delete();
        console.log("accept");
    } catch (error) {
        console.error('Error accepting user:', error);
        interaction.reply({ content: `An error occurred while accepting the user: ${error.message}`, ephemeral: true });
    }
}

const handle_guild_reject = async (interaction, db, client) => {
    try {
        console.log('Rejecting user');
        const { ign, userid, guildName } = get_application_message_content(interaction);

        console.log(`    Rejecting ${ign} from ${guildName}`)

        let sql = `SELECT application_channel FROM applications WHERE ign = LOWER(?) AND guild = ? AND application_status = 'open'`;
        let [rows] = await db.query(sql, [ign.toLowerCase(), guildName]);
        if (rows.length === 0) {
            console.log('    No open application found');
            return;
        }

        let application_channel = rows[0].application_channel;

        let channel;
        switch(guildName) {
            case 'Ironman Sweats':
                channel = await client.channels.fetch(IMS_application_channel);
                channel.send(`${ign} (<@${userid}>) has been rejected by ${interaction.user}!`);
                break;
            case 'Ironman Casuals':
                channel = await client.channels.fetch(IMC_application_channel);
                channel.send(`${ign} (<@${userid}>) has been rejected by ${interaction.user}!`);
                break;
            case 'Ironman Academy':
                channel = await client.channels.fetch(IMA_application_channel);
                channel.send(`${ign} (<@${userid}>) has been rejected by ${interaction.user}!`);
                break;
        }

        const member = await interaction.guild.members.fetch(userid);

        // Update database status
        sql = `UPDATE applications SET application_status = 'rejected' WHERE ign = LOWER(?) AND guild = ? AND application_status = 'open'`;
        [rows] = await db.query(sql, [ign.toLowerCase(), guildName]);
        if (rows.affectedRows === 0) {
            console.log('    No open application found');
        }

        let rejection_message = `You have been rejected from ${guildName} <@${userid}>`;

        // dm the user and send a message in the application channel
        const dm = await member.createDM();
        dm.send(rejection_message);
        application_channel = await client.channels.fetch(application_channel);
        application_channel.send(rejection_message);

        // Create a close channel button
        const CloseButton = new ActionRowBuilder()
            .addComponents(
                new ButtonBuilder()
                    .setCustomId('application_close')
                    .setLabel('Close Channel')
                    .setStyle(ButtonStyle.Danger)
            );

        await application_channel.send({ components: [CloseButton] });
        
        await interaction.message.delete();
    }
    catch (error) {
        console.error('Error rejecting user:', error);
        interaction.reply({ content: `An error occurred while rejecting the user: ${error.message}`, ephemeral: true });
    }
}

const handle_application_close = async (interaction, db, client) => {
    try {
        console.log('Closing application channel');

        let application_channel = interaction.message.channel;

        await application_channel.delete();
    } catch (error) {
        console.error('Error closing application channel:', error);
        interaction.reply({ content: `An error occurred while closing the application channel: ${error.message}`, ephemeral: true });
    }
}

const handle_guild_invited = async (interaction, db, client) => {
    try {
        if (!await check_permissions(interaction)) return;

        console.log('Marking user as invited')

        // get the application channel from db
        const { ign, userid, guildName } = get_waitlist_message_content(interaction);

        let sql = `SELECT application_channel FROM applications WHERE ign = LOWER(?) AND guild = ? AND application_status = 'accepted'`;
        let [rows] = await db.query(sql, [ign.toLowerCase(), guildName]);
        if (rows.length === 0) {
            console.log('    No accepted application found');
            return;
        }

        let application_channel = rows[0].application_channel;
        application_channel = await client.channels.fetch(application_channel);

        // set status to invited
        sql = `UPDATE applications SET application_status = 'invited' WHERE ign = LOWER(?) AND guild = ? AND application_status = 'accepted'`;
        [rows] = await db.query(sql, [ign.toLowerCase(), guildName]);
        if (rows.affectedRows === 0) {
            console.log('    No accepted application found');
        }

        // delete the application channel
        await application_channel.delete();
        await interaction.message.delete();
    } catch (error) {
        console.error('Error inviting user:', error);
        interaction.reply({ content: `An error occurred while inviting the user: ${error.message}`, ephemeral: true });
    }
}

const handle_guild_ask_to_leave = async (interaction, db, client) => {
    try {
        if (!await check_permissions(interaction)) return;

        console.log('Asking user to leave their guild')
        const { ign, userid, guildName } = get_waitlist_message_content(interaction);
        const member = await interaction.guild.members.fetch(userid);

        let sql = `SELECT application_channel FROM applications WHERE ign = LOWER(?) AND guild = ? AND application_status = 'accepted'`;
        let [rows] = await db.query(sql, [ign.toLowerCase(), guildName]);
        if (rows.length === 0) {
            console.log('    No accepted application found');
            return;
        }

        let application_channel = rows[0].application_channel;
        application_channel = await client.channels.fetch(application_channel);

        let ask_to_leave_message = `It is your turn to be invited to ${guildName}. Please leave your guild so you can get invited. <@${userid}>`;

        const dm = await member.createDM();
        dm.send(ask_to_leave_message);

        application_channel.send(ask_to_leave_message);

        interaction.reply({ content: `${ign} has been asked to leave their guild`, ephemeral: true });
        console.log(`    ${ign} has been asked to leave their guild`)
    } catch (error) {
        console.error('Error asking user to leave:', error);
        interaction.reply({ content: `An error occurred while asking the user to leave: ${error.message}`, ephemeral: true });
    }
}

const handle_guild_notify_invited = async (interaction, db, client) => {
    try {
        if (!await check_permissions(interaction)) return;

        console.log('Notifying user they have been invited')
        const { ign, userid, guildName } = get_waitlist_message_content(interaction);
        const member = await interaction.guild.members.fetch(userid);

        let sql = `SELECT application_channel FROM applications WHERE ign = LOWER(?) AND guild = ? AND application_status = 'accepted'`;
        let [rows] = await db.query(sql, [ign.toLowerCase(), guildName]);
        if (rows.length === 0) {
            console.log('    No accepted application found');
            return;
        }

        let application_channel = rows[0].application_channel;
        application_channel = await client.channels.fetch(application_channel);

        let notify_invited_message = `You have been invited to ${guildName}. Make sure to accept the invite. If you missed the invite, don't worry, you will receive another one. <@${userid}>`;

        const dm = await member.createDM();
        dm.send(notify_invited_message);

        application_channel.send(notify_invited_message);

        interaction.reply({ content: `${ign} has been notified of their invite`, ephemeral: true });
        console.log(`    ${ign} has been invited to ${guildName}`);
    } catch (error) {
        console.error('Error notifying user to leave:', error);
        interaction.reply({ content: `An error occurred while notifying the user to leave: ${error.message}`, ephemeral: true });
    }
}

module.exports = {
    setup_apply_command,
    setup_apply_interaction,
    handle_guild_selection,
    handle_guild_accept,
    handle_guild_reject,
    handle_application_close,
    handle_guild_invited,
    handle_guild_ask_to_leave,
    handle_guild_notify_invited
};