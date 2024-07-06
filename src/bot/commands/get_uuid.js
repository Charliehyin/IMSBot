require("dotenv").config();
const { SlashCommandBuilder } = require("discord.js");
const { get_uuid_from_ign } = require("../utils/get_uuid_from_ign");

const get_uuid_command = new SlashCommandBuilder()
	.setName("get_uuid")
	.setDescription("Get the UUID of a player")
	.addStringOption((option) =>
		option.setName("ign").setDescription("ign of the player").setRequired(true),
	);

const get_uuid_interaction = async (interaction, db) => {
	try {
		console.log("Getting UUID of player");
		const ign = interaction.options.getString("ign");

		console.log(`    IGN: ${ign}`);
		const uuid = await get_uuid_from_ign(ign);
		console.log(`    UUID: ${uuid}`);

		if (!uuid) {
			await interaction.reply(`The player \`${ign}\` does not exist`);
			return;
		}

		await interaction.reply(`The UUID of \`${ign}\` is ${uuid}`);
	} catch (error) {
		console.error(error);
		await interaction.reply(
			`There was an error while trying to get the UUID of the player: ${error.message}`,
		);
	}
};

module.exports = { get_uuid_command, get_uuid_interaction };
