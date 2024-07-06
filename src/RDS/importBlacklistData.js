require("dotenv").config();
const blacklist = require("./blacklist");
const mysql = require("mysql2/promise");

const db = mysql.createPool({
	host: process.env.DB_HOST,
	user: process.env.DB_USER,
	password: process.env.DB_PASSWORD,
	database: process.env.DB_NAME,
});

// Import blacklist data
const importBlacklistData = async () => {
	for (const entry of blacklist) {
		try {
			await db.query(
				"INSERT INTO blacklist (uuid, ign, reason, cheater, time_stamp) VALUES (?, ?, ?, ?, ?)",
				[
					entry.uuid,
					entry.username,
					entry.reason,
					true,
					Math.floor(Date.now() / 1000),
				],
			);
			console.log(`Added ${entry.username} to the blacklist`);
		} catch (err) {
			console.log("Error adding user to blacklist");
		}
	}
};

importBlacklistData();
