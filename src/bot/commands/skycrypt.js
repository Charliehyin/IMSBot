require('dotenv').config();
const { SlashCommandBuilder } = require('discord.js');

const skycrypt_command = new SlashCommandBuilder()
    .setName('skycrypt')
    .setDescription('Get the skycrypt link for a player')
    .addStringOption(option =>
        option.setName('ign')
            .setDescription('ign of the player')
            .setRequired(true));

const skycrypt_interaction = async (interaction, db) => {
    try {
        console.log('Getting skycrypt of player');
        const ign = interaction.options.getString('ign');

        console.log(`    IGN: ${ign}`)

        const skycrypt = `https://sky.shiiyu.moe/stats/${ign}`;

        await interaction.reply(`The skycrypt of \`${ign}\` is: \n${skycrypt}`);
    } catch (error) {
        console.error(error);
        await interaction.reply(`There was an error while trying to get the skycrypt of the player: ${error.message}`);
    }
}

module.exports = { skycrypt_command, skycrypt_interaction };