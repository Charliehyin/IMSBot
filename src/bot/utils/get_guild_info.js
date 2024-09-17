require('dotenv').config();

const get_guild_info = async (uuid) => {
    const fetch = (await import('node-fetch')).default;
    const key = process.env.HYPIXEL_API_KEY;
    const url = `https://api.hypixel.net/v2/guild?key=${key}&player=${uuid}`;

    try {
        const resp = await fetch(url, {
            method: "GET",
            headers: {
                "Content-Type": "application/json"
            }
        });

        if (resp.ok) {
            const data = await resp.json();
            if (data.guild === null) {
                console.log(`    ${uuid} is not in a guild`);
                return [-1, "Not in a guild"];
            }

            console.log(`    Guild ID: ${data.guild._id}`);
            
            let rank = "Member";
            // Find the member in the guild
            for (let member of data.guild.members) {
                if (member.uuid === uuid) {
                    console.log(`    Guild Rank: ${member.rank}`);
                    return [data.guild._id, member.rank];
                }
            }
            console.log(`    Unable to find rank`)
            return [data.guild._id, "Unknown Rank"];
        }

        throw new Error('    Error fetching guild data');
    }

    catch (error) {
        console.error('    Error fetching guild data:', error);
    }
}

module.exports = { get_guild_info }