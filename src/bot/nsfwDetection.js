const process_nsfw_message = async (message, model_url, channel, client) => {
    try {
        let notify = [];

        // Replace mentions with the user's nickname
        const message_cleaned = message.content.replace(/<@!?([0-9]+)>/g, (match, id) => {
            const guildMember = message.guild.members.cache.get(id);
            const nickname = guildMember ? (guildMember.nickname || guildMember.user.username) : match;
            return `@${nickname}`;
        });

        // Run model
        const response = await fetch(model_url, {
            method: 'POST',
            body: JSON.stringify({ text: message_cleaned }),
            headers: { 'Content-Type': 'application/json' }
        });

        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }

        const data = await response.json();

        console.log(message_cleaned);
        console.log(data);

        if (data.class === 'porn') {
            notify.push(`porn (${data.confidence.toFixed(2)})`);
        } else if (data.confidence < 0.7) {
            notify.push('maybe porn (low confidence)');
        }

        if (notify.length === 0) {
            return;
        }

        // Notify the user if the notification style is DM
        const timestamp = new Date(message.createdTimestamp).toLocaleString() + ' CDT';
        let replyContent = `**${notify.join(', ')}**\n<@${message.author.id}> ${timestamp}\n${message.content}\n${message.url}`;

        // Check if the message is a reply
        if (message.reference) {
            try {
                console.log('Fetching the original message');
                // Fetch the original message
                const originalMessage = await message.channel.messages.fetch(message.reference.messageId);

                // Get the content of the original message
                const originalMessageContent = originalMessage.content;
                const guildMember = originalMessage.guild.members.cache.get(originalMessage.author.id);

                // Get the user's nickname or use their username if they don't have a nickname
                const originalNickname = guildMember ? (guildMember.nickname || originalMessage.author.username) : originalMessage.author.username;

                // Example of sending a message including the original message content
                replyContent = `**${notify.join(', ')}**\n${originalNickname}:\nPREVIOUS MESSAGE: ${originalMessageContent}\n<@${message.author.id}> ${timestamp}\nREPLY: ${message.content}\n${message.url}`;
            } catch (error) {
                console.error('Error fetching the original message:', error);
            }
        }

        if (replyContent.length > 2000) {
            replyContent = 'Porn detected but message too long';
        }

        channel.send(replyContent);
    } catch (error) {
        console.error(error);
        // Optionally, you can notify the user that something went wrong
        // message.reply('The bot is currently not functioning properly. Please try again later.');
    }
};

module.exports = { process_nsfw_message };
