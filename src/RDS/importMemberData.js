require('dotenv').config();
const { verified_users } = require('./VerifiedUsers');
const mysql = require('mysql2/promise');

const db = mysql.createPool({
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME
});

// Import blacklist data
const importMemberData = async () => {
    for (const entry of verified_users) {
        try {
            let discord_id = entry.discord;
            let uuid = entry.uuid;
            let ign = entry.username;



            // Check if member exists in db
            // discord, uuid, username
            let sql = `SELECT ign FROM members WHERE discord_id = ? AND uuid = ?`;

            let [rows] = await db.query(sql, [discord_id, uuid]);
            if (rows.length > 0) {
                console.log(`    Member ${ign} already exists in database`)
                continue;
            }

            await db.query(
                'INSERT INTO members (discord_id, uuid, ign) VALUES (?, ?, ?)',
                [discord_id, uuid, ign]
            );
        } catch (err) {
            console.log(`Error adding ${ign} to members`)
        }
    }
}

importMemberData();

