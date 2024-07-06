require("dotenv").config()

const get_ironman_skyblock_xp = async (uuid) => {
  const fetch = (await import("node-fetch")).default
  const key = process.env.HYPIXEL_API_KEY
  const url = `https://api.hypixel.net/v2/skyblock/profiles?key=${key}&uuid=${uuid}`

  try {
    const resp = await fetch(url, {
      method: "GET",
      headers: {
        "Content-Type": "application/json",
      },
    })

    highestXp = -1

    if (resp.ok) {
      const data = await resp.json()
      for (const profile of data.profiles) {
        if (!profile.members[uuid]) {
          continue
        }
        if (profile.game_mode !== "ironman") {
          continue
        }
        highestXp = max(highestLevel, profile.members[uuid].leveling.experience)
      }
    }

    return highestXp
  } catch (error) {
    console.error("    Error fetching level data:", error)
  }
}

export default { get_ironman_skyblock_xp }
