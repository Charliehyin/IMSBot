require('dotenv').config();
const express = require('express');

// Health check server
const app = express();

app.get('/', (req, res) => {
    res.send('OK');
});

const PORT = process.env.PORT || 8080;
app.listen(PORT, () => {
    console.log(`Health check server running on port ${PORT}`);
});