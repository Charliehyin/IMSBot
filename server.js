require('dotenv').config();
const express = require('express');
const botStatus = require('./src/bot/botStatus');

// Health check server
const app = express();

app.get('/', (req, res) => {
    // Check if discord bot is running
    // If it is, return 200 OK with the bot status json
    // If it isn't, return 500 Internal Server Error
    if (botStatus.isRunning) {
        res.send(botStatus);
    } else {
        res.status(500).send('Bot is not running');
    }
});

const PORT = process.env.PORT || 8080;
app.listen(PORT, () => {
    console.log(`Health check server running on port ${PORT}`);
});