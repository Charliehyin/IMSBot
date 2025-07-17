const { EmbedBuilder } = require('discord.js');

class DiscordHandler {
    // Initializes handler with Discord client, channel IDs, and WS server
    constructor(client, channelIds, wsServer) {
        this.client = client;
        this.channelIds = channelIds;
        this.wsServer = wsServer;
        this.setup_event_handlers();
    }

    // Registers Discord and Minecraft event listeners
    setup_event_handlers() {
        this.client.on('messageCreate', msg => this.handle_discord_message(msg));
        this.wsServer.on('minecraftMessage', data => this.send_minecraft_message_to_discord(data));
    }

    // Processes incoming Discord messages and forwards them to Minecraft
    async handle_discord_message(msg) {
        if (msg.author.bot) return;

        let targetGuild = null;
        if (msg.channel.id === this.channelIds.IMS) {
            targetGuild = 'IMS';
        } else if (msg.channel.id === this.channelIds.IMA) {
            targetGuild = 'IMA';
        } else if (msg.channel.id === this.channelIds.IMC) {
            targetGuild = 'IMC';
        } else if (msg.channel.id !== this.channelIds.COMBINED) {
            return;
        }

        const displayName = msg.member?.displayName || msg.author.username;
        const messageToSend = { from: 'discord', msg: `${displayName}: ${msg.content}` };

        this.wsServer.send_to_minecraft(messageToSend, targetGuild);
        console.log(`[Discord] forwarded to ${targetGuild}:`, messageToSend);
    }

    // Sends Minecraft chat messages to the appropriate Discord channels
    async send_minecraft_message_to_discord({ guild, player, message }) {
        const validGuilds = ['IMS', 'IMC', 'IMA'];
        if (!validGuilds.includes(guild)) {
            console.warn(`[Discord] unknown guild: ${guild}`);
            return;
        }

        const embed = new EmbedBuilder()
            .setTitle(`[${guild}]`)
            .setColor(this.get_guild_color(guild))
            .setDescription(message)
            .setFooter({ text: `Received from: ${player}` });

        // Send embed to the guild-specific channel
        const guildChannel = await this.client.channels.fetch(this.channelIds[guild]);
        await guildChannel.send({ embeds: [embed] });
        console.log(`[Discord] sent embed to [${guild}] from ${player}:`, message);

        // Also send embed to the combined channel if configured
        if (this.channelIds.COMBINED) {
            const combinedChannel = await this.client.channels.fetch(this.channelIds.COMBINED);
            await combinedChannel.send({ embeds: [embed] });
            console.log(`[Discord] also sent embed to combined channel`);
        }
    }

    // Maps guild names to Discord embed colors
    get_guild_color(guild) {
        switch (guild) {
            case 'IMS':
                return 0xFF0000;
            case 'IMC':
                return 0x0000FF;
            case 'IMA':
                return 0x00FF00;
            default:
                return 0x00AE86;
        }
    }
}

module.exports = { DiscordHandler };
