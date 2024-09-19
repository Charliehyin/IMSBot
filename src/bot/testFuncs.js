require('dotenv').config();
const { check_ironman_hotm4 } = require('./utils/check_ironman_hotm4');
const { get_guild_info } = require('./utils/get_guild_info');

const testFunc = async () => {
    const uuid = '6583ae6d315e4c74abe4dc0b644a984d';
    const [guild_id, rank] = await get_guild_info(uuid);
    console.log('    Guild ID:', guild_id);
    console.log('    Rank:', rank);

    const isIronman = await check_ironman_hotm4(uuid);
    console.log('    Hotm4:', isIronman);
}

testFunc();