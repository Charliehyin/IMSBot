const { EmbedBuilder } = require('discord.js');

/**
 * Routes messages between Discord and Minecraft across multiple guild channels plus a combined channel.
 */
class DiscordHandler {
    /**
     * @param {import('discord.js').Client} client
     * @param {{ IMS: string, IMA: string, IMC: string, COMBINED?: string }} channelIds
     * @param {EventEmitter & { sendToMinecraft: Function }} wsServer
     */
    constructor(client, channelIds, wsServer) {
        this.client = client;
        this.channelIds = channelIds;
        this.wsServer = wsServer;
        this.setupEventHandlers();
    }

    setupEventHandlers() {
        this.client.on('messageCreate', msg => this.handleDiscordMessage(msg));
        this.wsServer.on('minecraftMessage', data => this.sendMinecraftMessageToDiscord(data));
    }

    /**
     * Forwards a Discord message into the corresponding Minecraft guild channel.
     */
    async handleDiscordMessage(msg) {
        if (msg.author.bot) return;

        let targetGuild = null;
        if (msg.channel.id === this.channelIds.IMS) {
            targetGuild = 'Ironman Sweats';
        } else if (msg.channel.id === this.channelIds.IMA) {
            targetGuild = 'Ironman Academy';
        } else if (msg.channel.id === this.channelIds.IMC) {
            targetGuild = 'Ironman Casuals';
        } else {
            return;
        }

        const displayName = msg.member?.displayName || msg.author.username;
        const messageToSend = { from: 'discord', msg: `${displayName}: ${msg.content}` };

        this.wsServer.sendToMinecraft(messageToSend, targetGuild);
        console.log(`[Discord] Forwarded to ${targetGuild}:`, messageToSend);
    }

    /**
     * Sends a Minecraft chat embed into Discord guild channels and also to the combined channel.
     */
    async sendMinecraftMessageToDiscord({ guild, player, message }) {
        const guildKeyMap = {
            'Ironman Sweats': 'IMS',
            'Ironman Academy': 'IMA',
            'Ironman Casuals': 'IMC'
        };
        const key = guildKeyMap[guild];
        if (!key) {
            console.warn(`[Discord] Unknown guild: ${guild}`);
            return;
        }

        // Build the embed
        const embed = new EmbedBuilder()
            .setTitle(`[${key}]`)
            .setColor(this.getGuildColor(guild))
            .setDescription(message)
            .setFooter({ text: `Received from: ${player}` });

        // Send to the specific guild channel
        const guildChan = await this.client.channels.fetch(this.channelIds[key]);
        await guildChan.send({ embeds: [embed] });
        console.log(`[Discord] Sent embed to [${key}] from ${player}:`, message);

        // Also send to the combined bridge channel if configured
        if (this.channelIds.COMBINED) {
            const combinedChan = await this.client.channels.fetch(this.channelIds.COMBINED);
            await combinedChan.send({ embeds: [embed] });
            console.log(`[Discord] Also sent embed to Combined channel`);
        }
    }

    /**
     * Returns a consistent color for each guild embed.
     */
    getGuildColor(guild) {
        switch (guild) {
            case 'Ironman Sweats': return 0xFF0000; // Red
            case 'Ironman Academy': return 0x0000FF; // Blue
            case 'Ironman Casuals': return 0x00FF00; // Green
            default: return 0x00AE86; // Teal
        }
    }
}

module.exports = DiscordHandler;
