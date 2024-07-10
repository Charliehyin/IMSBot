const { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
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
    ims_staff_role,
    imc_staff_role,
    ima_staff_role
} = require('../constants');

const setup_apply_command = new SlashCommandBuilder()
    .setName('setup_apply')
    .setDescription('Setup the guild application button')
    .setDefaultMemberPermissions(1099511627776)
    .addBooleanOption(option =>
        option.setName('ims_closed')
        .setDescription('If Ironman Sweats is closed'))
    .addBooleanOption(option =>
        option.setName('imc_closed')
        .setDescription('If Ironman Casuals is closed'))
    .addBooleanOption(option =>
        option.setName('ima_closed')
        .setDescription('If Ironman Academy is closed'));

async function setup_apply_interaction(interaction) {
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

async function handle_guild_selection(interaction, db, client) {
    try {
        console.log('Applying for guild')
        let sql = `SELECT uuid FROM members WHERE discord_id = ?`;
        let [rows] = await db.query(sql, [interaction.user.id]);

        if (rows.length === 0) {
            await interaction.reply({ content: 'You must link your Minecraft account before applying for a guild', ephemeral: true });
            return;
        }

        const uuid = rows[0].uuid;

        sql = `SELECT * FROM blacklist WHERE uuid = ?`;
        [rows] = await db.query(sql, [uuid]);

        if (rows.length > 0) {
            await interaction.reply({ content: `You are on the blacklist and cannot apply for a guild. \nReason: ${rows[0].reason}`, ephemeral: true });
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
            await interaction.reply({ content: `You must be Skyblock Level ${guildReq} to apply for ${guildName.replace('_', ' ')}`, ephemeral: true });
            console.log(`    User ${ign} does not meet the requirements for ${guildName}`);
            return;
        }

        // Check if the user already has an open application
        sql = `SELECT * FROM applications WHERE ign = LOWER(?) AND application_status = 'open'`;
        [rows] = await db.query(sql, [ign.toLowerCase()]);

        if (rows.length > 0) {
            await interaction.reply({ content: `You already have an open application for ${rows[0].guild}. Please wait for a response.`, ephemeral: true });
            console.log(`    User ${ign} already has an open application for ${rows[0].guild}`);
            return;
        }

        let applyMessage, channel;
        switch(guildName) {
            case 'Ironman Sweats':
                // Application process for Ironman Sweats
                channel = await client.channels.fetch(IMS_application_channel);
                applyMessage = await channel.send(`<@&${ims_staff_role}>\n${ign} (${member}) has applied for Ironman Sweats!`)

                break;
            case 'Ironman Casuals':
                // Application process for Ironman Casuals
                channel = await client.channels.fetch(IMC_application_channel);
                applyMessage = await channel.send(`<@&${imc_staff_role}>\n${ign} (${member}) has applied for Ironman Casuals!`)
                break;
            case 'Ironman Academy':
                // Application process for Ironman Academy
                channel = await client.channels.fetch(IMA_application_channel);
                applyMessage = await channel.send(`<@&${ima_staff_role}>\n${ign} (${member}) has applied for Ironman Academy!`)
                break;    
        }

        // Add the application to the database
        sql = `INSERT INTO applications (uuid, ign, discord_id, guild, application_status, time_stamp) VALUES (?, ?, ?, ?, 'open', ?)`;
        await db.query(sql, [uuid, ign, interaction.user.id, guildName, Math.floor(interaction.createdTimestamp/1000)]);
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

        await interaction.reply({ content: `You have successfully applied for ${guildName.replace('_', ' ')}.`, ephemeral: true });
    } catch (error) {
    console.error('Error applying for guild:', error);
    interaction.reply({ content: `An error occurred while applying for the guild: ${error.message}`, ephemeral: true });
    }
}

const get_application_message_content = (interaction) => {
    try {
        let content = interaction.message.content;
        content = content.split('\n')[1];
        const ign = content.split(" ")[0];
        const userid = content.split(" ")[1].replace("(", "").replace(")", "").replace("<@", "").replace(">", "");
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
        const userid = content.split(" ")[1].replace("(", "").replace(")", "").replace("<@", "").replace(">", "");
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
        // add the user to the waitlist
        switch(guildName) {
            case 'Ironman Sweats':
                channel = await client.channels.fetch(IMS_application_channel);
                waitlist_channel = await client.channels.fetch(IMS_waitlist);
                waitlist_message = await waitlist_channel.send(`${ign} (<@${userid}>)`);

                channel.send(`${ign} (<@${userid}>) has been accepted by ${interaction.user}!`);
                dm.send(`You have been accepted into ${guildName}. You are now on the waitlist. <#${IMS_waitlist}>`);
                break;
            case 'Ironman Casuals':
                channel = await client.channels.fetch(IMC_application_channel);
                waitlist_channel = await client.channels.fetch(IMC_waitlist);
                waitlist_message = await waitlist_channel.send(`${ign} (<@${userid}>)`);

                channel.send(`${ign} (<@${userid}>) has been accepted by ${interaction.user}!`);
                dm.send(`You have been accepted into ${guildName}. You are now on the waitlist. <#${IMC_waitlist}>`);
                break;
            case 'Ironman Academy':
                channel = await client.channels.fetch(IMA_application_channel);
                waitlist_channel = await client.channels.fetch(IMA_waitlist);
                waitlist_message = await waitlist_channel.send(`${ign} (<@${userid}>)`);

                channel.send(`${ign} (<@${userid}>) has been accepted by ${interaction.user}!`);
                dm.send(`You have been accepted into ${guildName}. You are now on the waitlist. <#${IMA_waitlist}>`);
                break;
        }

        const WaitlistActions = new ActionRowBuilder()
            .addComponents(
                new ButtonBuilder()
                    .setCustomId('guild_invited')
                    .setLabel('Invited')
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
        const sql = `UPDATE applications SET application_status = 'accepted' WHERE ign = LOWER(?) AND guild = ? AND application_status = 'open'`;
        const [rows] = await db.query(sql, [ign.toLowerCase(), guildName]);
        if (rows.affectedRows === 0) {
           console.log('    No open application found');
        }

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
        const sql = `UPDATE applications SET application_status = 'rejected' WHERE ign = LOWER(?) AND guild = ? AND application_status = 'open'`;
        const [rows] = await db.query(sql, [ign.toLowerCase(), guildName]);
        if (rows.affectedRows === 0) {
            console.log('    No open application found');
        }

        // dm the user
        const dm = await member.createDM();
        dm.send(`You have been rejected from ${guildName}`);
        
        await interaction.message.delete();
    }
    catch (error) {
        console.error('Error rejecting user:', error);
        interaction.reply({ content: `An error occurred while rejecting the user: ${error.message}`, ephemeral: true });
    }
}

const handle_guild_invited = async (interaction, db, client) => {
    try {
        await interaction.message.delete();
        console.log("invited");
    } catch (error) {
        console.error('Error inviting user:', error);
        interaction.reply({ content: `An error occurred while inviting the user: ${error.message}`, ephemeral: true });
    }
}

const handle_guild_ask_to_leave = async (interaction, db, client) => {
    try {
        // parse the user from the message. 
        // message format: ign (<@user>)
        const { ign, userid, guildName } = get_waitlist_message_content(interaction);
        const member = await interaction.guild.members.fetch(userid);

        // dm the user
        const dm = await member.createDM();
        dm.send(`It is your turn to be invited to ${guildName}. Please leave your guild so you can get invited. `);
        interaction.reply({ content: `${ign} has been asked to leave their guild`, ephemeral: true });
        console.log("ask-to-leave");
    } catch (error) {
        console.error('Error asking user to leave:', error);
        interaction.reply({ content: `An error occurred while asking the user to leave: ${error.message}`, ephemeral: true });
    }
}

const handle_guild_notify_invited = async (interaction, db, client) => {
    try {
        const { ign, userid, guildName } = get_waitlist_message_content(interaction);
        const member = await interaction.guild.members.fetch(userid);

        const dm = await member.createDM();
        dm.send(`You have been invited to ${guildName}. Make sure to accept the invite. If you missed the invite, please make a ticket and show this message.`);
        interaction.reply({ content: `${ign} has been notified of their invite`, ephemeral: true });
        console.log("notify invited: ");
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
    handle_guild_invited,
    handle_guild_ask_to_leave,
    handle_guild_notify_invited
};