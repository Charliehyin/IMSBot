require('dotenv').config();

const process_moderationapi_message = async (message, model_url, channel, client) => {
    try {
        const fetch = (await import('node-fetch')).default; // Dynamically import node-fetch
        const data = await fetch(model_url, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "Authorization": `Bearer ${process.env.MODERATION_API_KEY}`,
            },
            body: JSON.stringify({
                input: message.content, 
                model: 'text-moderation-stable'
            }),
        });
        
        let { results } = await data.json();
        const flagged = results[0].flagged;
        const categories = results[0].categories;
        console.log(message.content)
        console.log(results[0].category_scores)
        if (flagged) {
            const fields = Object.keys(categories).filter(key => categories[key]);

            console.log(fields)
            const timestamp = Math.floor(message.createdTimestamp/1000);
            let replyContent = `**${fields.join(', ')}**\n<@${message.author.id}> <t:${timestamp}:F> \n${message.content} \n${message.url}`;
            if (replyContent.length > 2000) {
                replyContent = `Flagged but message too long`;
            }
            channel.send(replyContent);
        }
    } catch(error) {
        console.error(error);
        // message.reply('The bot is currently not functioning properly. Please try again later.');
    }
}

module.exports = { process_moderationapi_message };