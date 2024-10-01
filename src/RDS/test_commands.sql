USE imsbot;

SELECT t1.*
FROM guild_member_data t1
JOIN (
    SELECT user_id, COUNT(DISTINCT skyblock_xp) AS xp_count
    FROM guild_member_data
    GROUP BY user_id
    HAVING xp_count > 1
) t2 ON t1.user_id = t2.user_id
ORDER BY t1.user_id, t1.time_stamp;
