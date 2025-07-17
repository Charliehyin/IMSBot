const { IMS_bridge_channel, IMC_bridge_channel, IMA_bridge_channel, Combined_bridge_channel} = require('../constants');

const channelIds = {
    IMS: IMS_bridge_channel,
    IMC: IMC_bridge_channel,
    IMA: IMA_bridge_channel,
    COMBINED: Combined_bridge_channel
};
const FIVE_MINUTES = 5 * 60 * 1000;

async function update_channel_topic(client, channelId, count, guildName = 'Combined') {
    try {
        const channel = await client.channels.fetch(channelId);
        if(channel) {
            const topic = `${guildName} Bridge - ${count} player${count !== 1 ? 's' : ''} connected`;
            await channel.setTopic(topic);
        }
    } catch(error) {
        console.error(`[Channel] Error updating topic for ${guildName}:`, error);
    }
}

function update_online_player_counts(client, wsServer) {
    const guildCounts = wsServer.get_connected_clients_by_guild();
    Object.entries(channelIds).forEach(([key, channelId]) => {
        const displayNames = {
            IMS: 'Ironman Sweats',
            IMA: 'Ironman Academy',
            IMC: 'Ironman Casuals',
            COMBINED: 'Combined'
        };
        const displayName = displayNames[key];
        const count = guildCounts[key] || 0;
        update_channel_topic(client, channelId, count, displayName);
    });
};


module.exports = { update_online_player_counts };
