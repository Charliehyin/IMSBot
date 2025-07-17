require('dotenv').config();
const mysql = require('mysql2/promise');
const { SlashCommandBuilder, EmbedBuilder, PermissionFlagsBits } = require('discord.js');
const {
	Key_generation_channel: keyGenerationChannel
} = require('../constants');
const { v4: uuidv4 } = require('uuid');

// Initialize MySQL pool for member and key storage
const dbPool = mysql.createPool({
	host: process.env.DB_HOST,
	user: process.env.DB_USER,
	password: process.env.DB_PASSWORD,
	database: process.env.DB_NAME,
});

/** Updates a user's record with a new bridge key */
async function save_bridge_key(discordId, bridgeKey) {
	try {
    	await dbPool.query(
    		'UPDATE members SET bridge_key = ? WHERE discord_id = ?',
      		[bridgeKey, discordId]
    	);
    	console.log(`Saved bridge key for user ${discordId}`);
  	}
	catch (error) {
    	console.error('Error saving bridge key:', error);
  	}
}

/** Clears a user's bridge key, revoking access */
async function delete_bridge_key(discordId) {
  	try {
   		await dbPool.query(
      		'UPDATE members SET bridge_key = NULL WHERE discord_id = ?',
     		[discordId]
    	);
   		console.log(`Deleted bridge key for user ${discordId}`);
  	}
	catch (error) {
    	console.error('Error deleting bridge key:', error);
  	}
}

// Define /bridgekey slash command structure
const bridge_key_command = new SlashCommandBuilder()
  	.setName('bridgekey')
  	.setDescription('Generate or retrieve your guild-bridge access key (DM’d).');

// Define /deactivate slash command structure with permissions
const deactivate_bridge_key_command = new SlashCommandBuilder()
  	.setName('deactivate')
  	.setDescription('Revoke a user’s bridge key')
  	.addUserOption(option =>
    	option.setName('user').setDescription('User to revoke').setRequired(true)
  	)
  	.setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers);

/** Handles /bridgekey: generates or returns existing key and DMs user */
async function bridgekey_interaction(interaction) {
  	if (interaction.channelId !== keyGenerationChannel) {
    	return interaction.reply({ content: '❌ Run this in the key-generation channel.', ephemeral: true });
  	}

  	const discordId = interaction.user.id;
  	const [rows] = await dbPool.query(
    	'SELECT * FROM members WHERE discord_id = ?',
    	[discordId]
  	);
 	const member = rows[0];

 	if (!member) {
    	return interaction.reply({ content: '❌ You must link your Minecraft account first.', ephemeral: true });
  	}

	let bridgeKey = member.bridge_key;
	if (!bridgeKey) {
		bridgeKey = uuidv4();
		await save_bridge_key(discordId, bridgeKey);
		await interaction.client.wsServer.reload_valid_keys();
	}

	const embed = new EmbedBuilder()
		.setTitle(`🔑 ${member.guild_name} Bridge Key`)
		.setDescription(`\`\`\`${bridgeKey}\`\`\``)
		.setTimestamp();

	try {
		await interaction.user.send({ embeds: [embed] });
		await interaction.reply({ content: '✅ I’ve DMed you your bridge key!', ephemeral: true });
	} catch (error) {
		console.error('DM failed:', error);
		await interaction.reply({ content: '❌ Could not DM you. Check privacy settings.', ephemeral: true });
	}
}

/** Handles /deactivate: revokes a user's bridge key if caller is moderator */

async function deactivate_interaction(interaction) {
	const targetUser = interaction.options.getUser('user');
	await delete_bridge_key(targetUser.id);
	await interaction.client.wsServer.reload_valid_keys();
	await interaction.reply({ content: `🔒 Bridge key for <@${targetUser.id}> deactivated.`, ephemeral: true });
}

module.exports = {
	bridge_key_command,
	deactivate_bridge_key_command,
	bridgekey_interaction,
	deactivate_interaction,
};
