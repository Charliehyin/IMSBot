USE imsbot;

DROP TABLE mutes;

CREATE TABLE current_punishments (
    id INT AUTO_INCREMENT PRIMARY KEY,
    user_id VARCHAR(20) NOT NULL,
    guild_id VARCHAR(20) NOT NULL,
    end_time BIGINT NOT NULL,
    reason TEXT,
    punishment_type VARCHAR(20) NOT NULL,
    INDEX (end_time)
);

