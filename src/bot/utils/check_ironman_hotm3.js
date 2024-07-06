require("dotenv").config();

const check_ironman_hotm3 = async (uuid) => {
	const fetch = (await import("node-fetch")).default;
	const key = process.env.HYPIXEL_API_KEY;
	const url = `https://api.hypixel.net/v2/skyblock/profiles?key=${key}&uuid=${uuid}`;
	console.log(url);

	try {
		const resp = await fetch(url, {
			method: "GET",
			headers: {
				"Content-Type": "application/json",
			},
		});

		if (resp.ok) {
			const data = await resp.json();
			for (let profile of data.profiles) {
				if (!profile.members[uuid]) {
					continue;
				}
				if (profile.game_mode !== "ironman") {
					continue;
				}
				if (profile.members[uuid].mining_core.experience >= 12000) {
					console.log(`    ${uuid} has Ironman HOTM3`);
					return true;
				}
			}
		}

		return false;
	} catch (error) {
		console.error("    Error fetching hotm data:", error);
	}
};

module.exports = { check_ironman_hotm3 };
