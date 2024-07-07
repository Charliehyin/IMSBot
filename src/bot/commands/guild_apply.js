require("dotenv").config()
const {
  SlashCommandBuilder,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
} = require("discord.js")
const { get_uuid_from_ign } = require("../utils/get_uuid_from_ign")
const { get_ironman_skyblock_xp } =
  require("../utils/get_ironman_skyblock_xp").default
const { embedColor, IMA_req, IMC_req, IMS_req } = require("../constants")

const guild_apply_command = new SlashCommandBuilder()
  .setName("guild_apply")
  .setDescription("Apply for a guild")
  .addSubcommand((subcommand) =>
    subcommand
      .setName("ironman_sweats")
      .setDescription("Apply for the Ironman Sweats guild"),
  )
  .addSubcommand((subcommand) =>
    subcommand
      .setName("ironman_casuals")
      .setDescription("Apply for the Ironman Casuals guild"),
  )
  .addSubcommand((subcommand) =>
    subcommand
      .setName("ironman_academy")
      .setDescription("Apply for the Ironman Academy guild"),
  )

const guild_apply_interaction = async (interaction, db) => {
  try {
    console.log("Applying for guild")
    const subcommand = interaction.options.getSubcommand()

    // get uuid from database
    let sql = "SELECT uuid FROM members WHERE discord_id = ?"
    let [rows] = await db.query(sql, [interaction.member.user.id])

    if (rows.length === 0) {
      await interaction.reply({
        content:
          "You must link your Minecraft account before applying for a guild",
        ephemeral: true,
      })
      return
    }

    const uuid = rows[0].uuid

    // Check if user is on blacklist
    sql = "SELECT * FROM blacklist WHERE uuid = ?"
    ;[rows] = await db.query(sql, [uuid])

    if (rows.length > 0 && rows[0].cheater) {
      await interaction.reply({
        content: `You are on the blacklist and cannot apply for a guild. \nReason: ${rows[0].reason}`,
        ephemeral: true,
      })
      return
    }

    // Check skyblock xp
    const skyblock_xp = await get_ironman_skyblock_xp(uuid)

    if (subcommand === "ironman_sweats") {
      console.log("    Applying for Ironman Sweats")
      if (skyblock_xp < IMS_req * 100) {
        console.log(`    Not enough skyblock xp: ${skyblock_xp}`)
        await interaction.reply({
          content: `You must be Skyblock Level ${IMS_req} to apply for IMS`,
          ephemeral: true,
        })
        return
      }
      await interaction.reply({
        content:
          "You have not successfully applied for Ironman Sweats (not implemented yet)",
        ephemeral: true,
      })
    } else if (subcommand === "ironman_casuals") {
      console.log("    Applying for Ironman Casuals")
      if (skyblock_xp < IMC_req * 100) {
        console.log(`    Not enough skyblock xp: ${skyblock_xp}`)
        await interaction.reply({
          content: `You must be Skyblock Level ${IMC_req} to apply for IMC`,
          ephemeral: true,
        })
        return
      }
      await interaction.reply({
        content:
          "You have not successfully applied for Ironman Casuals (not implemented yet)",
        ephemeral: true,
      })
    } else if (subcommand === "ironman_academy") {
      console.log("    Applying for Ironman Academy")
      if (skyblock_xp < IMA_req * 100) {
        console.log(`    Not enough skyblock xp: ${skyblock_xp}`)
        await interaction.reply({
          content: `You must be Skyblock Level ${IMA_req} to apply for IMA`,
          ephemeral: true,
        })
        return
      }
      await interaction.reply({
        content:
          "You have not successfully applied for Ironman Academy (not implemented yet)",
        ephemeral: true,
      })
    }
  } catch (error) {
    console.error("Error applying for guild:", error)
    await interaction.reply({
      content: `An error occurred while applying for a guild: ${error.message}`,
    })
  }
}

module.exports = { guild_apply_command, guild_apply_interaction }
