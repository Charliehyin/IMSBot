USE imsbot;

CREATE TABLE mutes (
    id INT AUTO_INCREMENT PRIMARY KEY,
    user_id VARCHAR(20) NOT NULL,
    guild_id VARCHAR(20) NOT NULL,
    end_time BIGINT NOT NULL,
    reason TEXT,
    INDEX (end_time)
);

