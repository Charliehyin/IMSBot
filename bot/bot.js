require('dotenv').config();
const { Client, GatewayIntentBits, REST, Routes, SlashCommandBuilder } = require('discord.js');

// Create a new client instance
const client = new Client({ intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent, GatewayIntentBits.DirectMessages] });

// When the client is ready, run this code
client.once('ready', () => {
    console.log(`Logged in as ${client.user.tag}!`);
    registerSlashCommands();
});

// Slash command registration
async function registerSlashCommands() {
    const commands = [
        new SlashCommandBuilder()
            .setName('setup')
            .setDescription('Setup notifications')
            .addStringOption(option =>
                option.setName('user_id')
                    .setDescription('User ID to notify')
                    .setRequired(true))
            .addStringOption(option =>
                option.setName('notification_style')
                    .setDescription('Notification style')
                    .setRequired(true)
                    .addChoices(
                        { name: 'DM', value: 'DM' },
                        { name: 'Channel', value: 'Channel' }
                    ))
            .addStringOption(option =>
                option.setName('notification_channel')
                    .setDescription('Notification channel ID')
                    .setRequired(true))
            .addStringOption(option =>
                option.setName('search_mechanism')
                    .setDescription('Search mechanism')
                    .setRequired(true)
                    .addChoices(
                        { name: 'keyword', value: 'keyword' },
                        { name: 'ml', value: 'ml' },
                        { name: 'both', value: 'both'}
                    ))
            .addStringOption(option =>
                option.setName('keywords')
                    .setDescription('Keywords for the search')
                    .setRequired(true))
    ].map(command => command.toJSON());

    const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_TOKEN);

    try {
        console.log('Started refreshing application (/) commands.');

        await rest.put(
            Routes.applicationCommands(client.user.id),
            { body: commands }
        );

        console.log('Successfully reloaded application (/) commands.');
    } catch (error) {
        console.error(error);
    }
}

client.on('interactionCreate', async interaction => {
    if (!interaction.isChatInputCommand()) return;

    const { commandName } = interaction;

    if (commandName === 'setup') {
        const userId = interaction.options.getString('user_id');
        const notificationStyle = interaction.options.getString('notification_style');
        const notificationTo = interaction.options.getString('notification_channel');
        const searchMechanism = interaction.options.getString('search_mechanism');
        const keywords = interaction.options.getString('keywords');

        // Send these values to RDS for storage. 


        // Store the setup information (in-memory storage for simplicity)
        // You can use a database for persistent storage
        interaction.client.setupData = {
            userId,
            notificationStyle,
            notificationTo,
            searchMechanism,
            keywords
        };

        await interaction.reply(`Setup completed for user ID: ${userId} with notification style: ${notificationStyle}`);
    }
});

// Commands for testing notifications
client.on('messageCreate', async message => {
    if (message.content === '$dm') {
        const setupData = client.setupData;
        if (setupData && setupData.notificationStyle === 'DM') {
            const user = await client.users.fetch(setupData.userId);
            user.send('This is a test DM notification!');
        } else {
            message.reply('DM notification is not set up.');
        }
    } else if (message.content === '$channel') {
        const setupData = client.setupData;
        if (setupData && setupData.notificationStyle === 'Channel') {
            const channel = await client.channels.fetch(setupData.notificationTo);
            channel.send('This is a test Channel notification!');
        } else {
            message.reply('Channel notification is not set up.');
        }
    }
});

// Login to Discord with your app's token
client.login(process.env.DISCORD_TOKEN);
