// src/bot/commands/bridge_commands.js
require('dotenv').config();
const { SlashCommandBuilder, EmbedBuilder, PermissionFlagsBits } = require('discord.js');
const {
  Key_generation_channel,
  MODERATOR_ROLE_ID
} = require('../constants');
const {
  getMemberByDiscordId,
  setMemberKey,
  deactivateKeyForDiscordId
} = require('../utils/dataUtils');
const { v4: uuidv4 } = require('uuid');


// ——— Slash command definitions ————————————————————————————————
const bridgekey_command = new SlashCommandBuilder()
  .setName('bridgekey')
  .setDescription('Generate or retrieve your guild-bridge access key (DM’d).');

const deactivate_command = new SlashCommandBuilder()
  .setName('deactivate')
  .setDescription('Revoke a user’s bridge key')
  .addUserOption(opt =>
    opt.setName('user')
       .setDescription('User to revoke')
       .setRequired(true)
  )
  .setDefaultMemberPermissions(PermissionFlagsBits.ManageRoles);
// ——————————————————————————————————————————————————————————


// ——— /bridgekey handler —————————————————————————————————————
async function bridgekey_interaction(interaction) {
  // 1) Only in the key-gen channel
  if (interaction.channelId !== Key_generation_channel) {
    return interaction.reply({
      content: '❌ You must run this in the key-generation channel.',
      ephemeral: true
    });
  }

  // 2) Fetch from DB
  const discordId = interaction.user.id;
  const member = await getMemberByDiscordId(discordId);

  if (!member) {
    return interaction.reply({
      content: '❌ You are not registered in our guild-members list yet.',
      ephemeral: true
    });
  }

  // 3) Generate or reuse their key
  let key = member.uuid;
  if (!key) {
    key = uuidv4();
    await setMemberKey(discordId, key);
  }

  // 4) DM embed
  const embed = new EmbedBuilder()
    .setTitle(`🔑 ${member.guild_name} Bridge Key`)
    .setDescription(`\`\`\`${key}\`\`\``)
    .setTimestamp();

  try {
    await interaction.user.send({ embeds: [embed] });
    await interaction.reply({ content: '✅ I’ve DMed you your bridge key!', ephemeral: true });
  } catch (err) {
    console.error('DM failed:', err);
    await interaction.reply({
      content: '❌ Could not DM you. Check your privacy settings.',
      ephemeral: true
    });
  }
}
// ——————————————————————————————————————————————————————————


// ——— /deactivate handler ————————————————————————————————————
async function deactivate_interaction(interaction) {
  // 1) Only in the key-gen channel
  if (interaction.channelId !== Key_generation_channel) {
    return interaction.reply({
      content: '❌ You must run this in the key-generation channel.',
      ephemeral: true
    });
  }

  // 2) Mod permission (Manage Roles)
  if (!interaction.member.roles.cache.has(MODERATOR_ROLE_ID)) {
    return interaction.reply({ content: '❌ You lack permission.', ephemeral: true });
  }

  const target = interaction.options.getUser('user');
  await deactivateKeyForDiscordId(target.id);

  await interaction.reply({
    content: `🔒 Bridge key for <@${target.id}> has been deactivated.`,
    ephemeral: true
  });
}
// ——————————————————————————————————————————————————————————


module.exports = {
  bridgekey_command,
  deactivate_command,
  bridgekey_interaction,
  deactivate_interaction
};
