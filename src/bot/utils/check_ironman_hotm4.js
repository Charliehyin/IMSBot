require('dotenv').config();

const check_ironman_hotm4 = async (uuid) => {
    const fetch = (await import('node-fetch')).default;
    const key = process.env.HYPIXEL_API_KEY;
    const url = `https://api.hypixel.net/v2/skyblock/profiles?key=${key}&uuid=${uuid}`;

    try {
        const resp = await fetch(url, {
            method: "GET",
            headers: {
                "Content-Type": "application/json"
            }
        });

        if (resp.ok) {
            const data = await resp.json();
            for (let profile of data.profiles) {
                console.log(`    Checking profile ${profile.profile_id}`);
                console.log(`    Game mode: ${profile.game_mode}`);
                if (!profile.members[uuid]) {
                    continue;
                }
                if (profile.game_mode !== 'ironman') {
                    continue;
                }
                if (!profile.members[uuid].mining_core) {
                    console.log(`    ${uuid} does not have mining core`);
                    continue;
                }
                console.log(`    Hotm xp: ${profile.members[uuid].mining_core.experience}`);
                if (profile.members[uuid].mining_core.experience >= 37000) {
                    console.log(`    ${uuid} has Ironman HOTM4`);
                    return true;
                }
            }
        }

        return false;
    }

    catch (error) {
        console.error('    Error fetching hotm data:', error);
    }
}

module.exports = { check_ironman_hotm4 }