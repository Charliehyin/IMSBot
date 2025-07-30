const { EmbedBuilder } = require('discord.js');
const { IMS_bridge_channel, IMC_bridge_channel, IMA_bridge_channel, Combined_bridge_channel} = require('../constants');

const channelIds = {
    IMS: IMS_bridge_channel,
    IMC: IMC_bridge_channel,
    IMA: IMA_bridge_channel,
    COMBINED: Combined_bridge_channel
};
class DiscordHandler {
    // Initializes handler with Discord client, channel IDs, and WS server
    constructor(client, wsServer) {
        this.client = client;
        this.wsServer = wsServer;
        this.setup_event_handlers();
    }

    // Registers Discord and Minecraft event listeners
    setup_event_handlers() {
        this.client.on('messageCreate', msg => this.handle_discord_message(msg));
        this.wsServer.on('minecraftMessage', data => this.send_minecraft_message_to_discord(data));
        this.wsServer.on('minecraftBounce', data => this.bounce_minecraft_message(data));
    }

    // Processes incoming Discord messages and forwards them to Minecraft
    async handle_discord_message(msg) {
        if (msg.author.bot) return;

        let targetGuild = null;
        let combinedBridgeEnabled = false;
        if (msg.channel.id === channelIds.IMS) {
            targetGuild = 'IMS';
        } else if (msg.channel.id === channelIds.IMA) {
            targetGuild = 'IMA';
        } else if (msg.channel.id === channelIds.IMC) {
            targetGuild = 'IMC';
        } else if (msg.channel.id === channelIds.COMBINED) {
            combinedBridgeEnabled = true;
        } else {
            return;
        }

        const displayName = msg.member?.displayName || msg.author.username;
        const messageToSend = { from: 'discord', msg: `${displayName}: ${msg.content}`, combinedbridge: combinedBridgeEnabled, guild: targetGuild};

        this.wsServer.send_to_minecraft(messageToSend, targetGuild);
    }

    bounce_minecraft_message(data) {
        try {
            const { msg, player, combinedbridge, guild } = data;
            
            const displayNames = {
                IMS: 'Ironman Sweats',
                IMA: 'Ironman Academy',
                IMC: 'Ironman Casuals'
            };
            const guild_name = displayNames[guild];
            const messageToBounce = {
                from: 'mc',
                msg: player + ": " + msg,
                combinedbridge: combinedbridge,
                fromplayer: player,
                guild: guild_name
            };
            
            this.wsServer.send_to_minecraft(messageToBounce, null, null);

        } catch (err) {
            console.error('[MC] Bounce error:', err);
        }
    }

    // Sends Minecraft chat messages to the appropriate Discord channels
    async send_minecraft_message_to_discord(data) {
        try{
            let { guild, player, combinedbridge, message } = data;
            let targetChannelId = null;
            let guildDisplayName = '';

            switch(guild) {
                case 'IMS':
                    targetChannelId = channelIds.IMS;
                    guildDisplayName = '[IMS]';
                    break;
                case 'IMA':
                    targetChannelId = channelIds.IMA;
                    guildDisplayName = '[IMA]';
                    break;
                case 'IMC':
                    targetChannelId = channelIds.IMC;
                    guildDisplayName = '[IMC]';
                    break;
                default:
                    console.warn(`[Discord] Unknown guild: ${data}`);
                    return;
            }
            if (combinedbridge) {
                targetChannelId = channelIds.COMBINED;
                message = player + ": " + message;

            }

            const embed = new EmbedBuilder()
                .setColor(this.get_guild_color(guild))
                .setDescription(message)
                .setFooter({ text: `Received from: ${guildDisplayName} ${player}` });

            const channel = await this.client.channels.fetch(targetChannelId);
            await channel.send({ embeds: [embed] });
        } catch(err) {
            console.error('[Discord] Send error:', err);
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

exports.DiscordHandler = DiscordHandler;
