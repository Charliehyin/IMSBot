require("dotenv").config();

const get_uuid_from_ign = async (ign) => {
	const fetch = (await import("node-fetch")).default;
	try {
		let uuid_url = `https://api.mojang.com/users/profiles/minecraftbroken/${ign}`;

		const resp = await fetch(uuid_url, {
			method: "GET",
			headers: {
				"Content-Type": "application/json",
			},
		});

		if (resp.ok) {
			const data = await resp.json();
			return data.id.replace(/-/g, "");
		}

		// Try again with alternate API
		uuid_url = `https://playerdb.co/api/player/minecraft/${ign}`;
		const resp2 = await fetch(uuid_url, {
			method: "GET",
			headers: {
				"Content-Type": "application/json",
				"user-agent": "IMS Bot (discord.gg/ims)",
			},
		});

		if (resp2.ok) {
			const data = await resp2.json();
			return data.data.player.id.replace(/-/g, "");
		}

		throw new Error("Error fetching player uuid");
	} catch (error) {
		console.error("Error fetching player data:", error);
	}
};
// https://playerdb.co/api/player/minecraft/

module.exports = { get_uuid_from_ign };
