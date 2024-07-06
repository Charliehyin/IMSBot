require("dotenv").config();
const {
	SlashCommandBuilder,
	EmbedBuilder,
	ActionRowBuilder,
	ButtonBuilder,
	ButtonStyle,
} = require("discord.js");
const itemsPerPage = 20;

const punishments_command = new SlashCommandBuilder()
	.setName("punishments")
	.setDescription("Manage punishments")
	.setDefaultMemberPermissions(1099511627776)
	.addSubcommand((subcommand) =>
		subcommand
			.setName("add")
			.setDescription("Add a punishment")
			.addMentionableOption((option) =>
				option
					.setName("user")
					.setDescription("punished user")
					.setRequired(true),
			)
			.addStringOption((option) =>
				option
					.setName("punishment")
					.setDescription("type and length of punishment")
					.setRequired(true),
			)
			.addStringOption((option) =>
				option
					.setName("reason")
					.setDescription("reason for the punishment")
					.setRequired(true),
			),
	)
	.addSubcommand((subcommand) =>
		subcommand
			.setName("view")
			.setDescription("view all punishments for a user")
			.addMentionableOption((option) =>
				option
					.setName("user")
					.setDescription("punished user")
					.setRequired(true),
			),
	)
	.addSubcommand((subcommand) =>
		subcommand
			.setName("remove")
			.setDescription("remove a punishment")
			.addStringOption((option) =>
				option
					.setName("punishment_id")
					.setDescription("id of punishment to remove")
					.setRequired(true),
			),
	);

const punishments_interaction = async (interaction, db) => {
	try {
		const subcommand = interaction.options.getSubcommand();

		if (subcommand === "add") {
			console.log("Adding a punishment");

			const user = interaction.options.getMentionable("user");
			const punishment = interaction.options.getString("punishment");
			const reason = interaction.options.getString("reason");
			const discord_id = user.id;

			console.log(`    User: ${discord_id}`);
			console.log(`    Punishment: ${punishment}`);
			console.log(`    Reason: ${reason}`);

			// Add punishment to db
			sql =
				"INSERT INTO punishments (discord_id, punishment, reason, time_stamp) VALUES (?, ?, ?, ?)";
			let [rows] = await db.query(sql, [
				discord_id,
				punishment,
				reason,
				Math.floor(interaction.createdTimestamp / 1000),
			]);

			const lastInsertId = rows.insertId;

			if (rows.length === 0) {
				await interaction.reply(`Failed to add punishment for ${user}`);
				return;
			}

			const embed = new EmbedBuilder()
				.setTitle("Punishment Logged for:")
				.setDescription(`<@${discord_id}>`)
				.setColor("#FF0000")
				.addFields(
					{ name: "Punishment", value: punishment, inline: true },
					{ name: "Reason", value: reason, inline: true },
				);

			interaction.reply({ embeds: [embed] });

			// Get message link of the embed reply, and add it to db
			const message = await interaction.fetchReply();
			const messageLink = `https://discord.com/channels/${interaction.guildId}/${interaction.channelId}/${message.id}`;
			sql = "UPDATE punishments SET punishment_link = ? WHERE id = ?";
			[rows] = await db.query(sql, [messageLink, lastInsertId]);

			if (rows.length === 0) {
				console.log(
					`Failed to add message link for punishment for ${discord_id}`,
				);
				return;
			}
			console.log(`Added message link for punishment for ${discord_id}`);

			// Start a thread on the message
			const thread = await message.startThread({
				name: "Proof",
				autoArchiveDuration: 1440,
			});
		} else if (subcommand === "view") {
			console.log("Viewing punishments");
			const user = interaction.options.getMentionable("user");
			const username = user.user.username;

			console.log(`User: ${user}`);

			const sql =
				"SELECT * FROM punishments WHERE discord_id = ? ORDER BY time_stamp DESC";
			const [rows] = await db.query(sql, [user.id]);

			if (rows.length === 0) {
				await interaction.reply(`No punishments found for ${user}`);
				return;
			}

			const pages = [];

			for (let i = 0; i < rows.length; i += itemsPerPage) {
				const pageRows = rows.slice(i, i + itemsPerPage);
				const embed = new EmbedBuilder()
					.setTitle(`Viewing Punishments for ${username}`)
					.setColor("#FF0000")
					.setFooter({
						text: `Page ${pages.length + 1}/${Math.ceil(rows.length / itemsPerPage)}`,
					});

				let punishmentList = "";
				let timeList = "";
				let idList = "";

				for (const row of pageRows) {
					const punishment_reason = `${row.punishment} - ${row.reason}`;
					if (punishment_reason.length > 55) {
						punishmentList += `[${punishment_reason.substring(0, 55)} ](${row.punishment_link})...\n`;
					} else {
						punishmentList += `[${punishment_reason}](${row.punishment_link})\n`;
					}
					timeList += `<t:${row.time_stamp}:R>\n`;
					idList += `${row.id}\n`;
				}

				embed.addFields(
					{ name: "Punishment", value: punishmentList, inline: true },
					{ name: "Time", value: timeList, inline: true },
					{ name: "ID", value: idList, inline: true },
				);

				pages.push(embed);
			}

			let currentPage = 0;

			const row = new ActionRowBuilder().addComponents(
				new ButtonBuilder()
					.setCustomId("previous")
					.setLabel("Previous")
					.setStyle(ButtonStyle.Primary),
				new ButtonBuilder()
					.setCustomId("next")
					.setLabel("Next")
					.setStyle(ButtonStyle.Primary),
			);

			const response = await interaction.reply({
				embeds: [pages[currentPage]],
				components: [row],
				fetchReply: true,
			});

			const collector = response.createMessageComponentCollector({
				time: 60000,
			});

			collector.on("collect", async (i) => {
				if (i.customId === "previous") {
					currentPage = currentPage > 0 ? --currentPage : pages.length - 1;
				} else if (i.customId === "next") {
					currentPage = currentPage + 1 < pages.length ? ++currentPage : 0;
				}

				await i.update({
					embeds: [pages[currentPage]],
					components: [row],
				});
			});

			collector.on("end", () => {
				for (const button of row.components) {
					button.setDisabled(true);
				}
				interaction.editReply({ components: [row] });
			});
		} else if (subcommand === "remove") {
			console.log("Removing a punishment");
			const punishment_id = interaction.options.getString("punishment_id");

			console.log(`    Punishment ID: ${punishment_id}`);

			// Check if punishment exists
			sql = "SELECT * FROM punishments WHERE id = ?";
			const [rows] = await db.query(sql, [punishment_id]);
			if (rows.length === 0) {
				await interaction.reply(
					`Punishment with ID ${punishment_id} not found`,
				);
				return;
			}

			// Remove punishment from db
			sql = "DELETE FROM punishments WHERE id = ?";
			await db.query(sql, [punishment_id]);

			await interaction.reply(
				`Successfully removed punishment with ID ${punishment_id}`,
			);
		}
	} catch (error) {
		console.error(error);
		await interaction.reply(
			`There was an error while trying to manage punishments: ${error.message}`,
		);
	}
};

module.exports = { punishments_command, punishments_interaction };
