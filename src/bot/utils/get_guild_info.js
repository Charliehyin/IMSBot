require('dotenv').config();

const get_guild_info = async (uuid) => {
    const fetch = (await import('node-fetch')).default;
    const key = process.env.HYPIXEL_API_KEY;
    const url = `https://api.hypixel.net/guild?key=${key}&player=${uuid}`;

    try {
        const resp = await fetch(url, {
            method: "GET",
            headers: {
                "Content-Type": "application/json"
            }
        });

        if (resp.ok) {
            const data = await resp.json();
            console.log(`   Guild ID: ${data.guild._id}`);
            return data.guild._id;
        }

        throw new Error('   Error fetching guild data');
    }

    catch (error) {
        console.error('   Error fetching guild data:', error);
    }
}

module.exports = { get_guild_info }