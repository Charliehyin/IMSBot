require("dotenv").config();
const { EmbedBuilder } = require("discord.js");
const { embedColor } = require("./constants");

const process_moderationapi_message = async (
	message,
	model_url,
	channel,
	client,
) => {
	try {
		const fetch = (await import("node-fetch")).default; // Dynamically import node-fetch
		const data = await fetch(model_url, {
			method: "POST",
			headers: {
				"Content-Type": "application/json",
				Authorization: `Bearer ${process.env.MODERATION_API_KEY}`,
			},
			body: JSON.stringify({
				input: message.content,
				model: "text-moderation-stable",
			}),
		});

		const { results } = await data.json();
		const flagged = results[0].flagged;
		const categories = results[0].categories;
		console.log(`${flagged}: ${message.content}`);
		if (flagged) {
			const fields = Object.keys(categories).filter((key) => categories[key]);

			console.log(`    ${fields}`);
			const timestamp = Math.floor(message.createdTimestamp / 1000);

			let replyContent = `<@${message.author.id}>: ${message.content}. [Link](${message.url})`;
			if (replyContent.length > 2000) {
				replyContent = `Flagged but message too long: ${message.url}`;
			}

			const embed = new EmbedBuilder()
				.setDescription(replyContent)
				.setColor(embedColor);
			//     embed.addFields(
			//         { name: 'Author', value: `<@${message.author.id}>`, inline: true },
			//         { name: 'Time', value: `<t:${timestamp}:f>`, inline: true },
			//         { name: 'Message', value: `${message.content}`, inline: false },
			//         { name: 'Link', value: message.url, inline: false }
			//     );

			channel.send({ embeds: [embed] });

			// channel.send(replyContent);
		}
	} catch (error) {
		console.error(error);
		// message.reply('The bot is currently not functioning properly. Please try again later.');
	}
};

module.exports = { process_moderationapi_message };
