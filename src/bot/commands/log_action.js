require('dotenv').config();
const { embedColor, log_channel, guild_id } = require('../constants');
const { EmbedBuilder, Client } = require('discord.js');

async function log_action(client, command, author, user_id, action) {
    const log_embed = new EmbedBuilder()
        .setColor(embedColor)
        .setAuthor({ name: `${author.username}#${author.discriminator}`, iconURL: author.displayAvatarURL() })
        .setDescription(`**${command}**\n${action}`)
        .setTimestamp()
        .setFooter({ text: `Affected user: ${user_id}` });

    // const guild = await client.guilds.fetch(guild_id);
    const log_channel_ds = await client.channels.fetch(log_channel);
    log_channel_ds.send({ embeds: [log_embed] });
}

module.exports = { log_action };
