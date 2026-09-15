CREATE DATABASE IF NOT EXISTS imsbot;

USE imsbot;

-- DROP TABLE IF EXISTS porn_messages;
-- DROP TABLE IF EXISTS normal_messages;
-- DROP TABLE IF EXISTS members;
-- DROP TABLE IF EXISTS blacklist;
-- DROP TABLE IF EXISTS punishments;
-- DROP TABLE IF EXISTS applications;
-- DROP TABLE IF EXISTS current_punishments;
-- DROP TABLE IF EXISTS guild_member_data;

CREATE TABLE members
(
    discord_id varchar(32) not null,
    ign varchar(32) not null,
    uuid varchar(32) not null
);

CREATE TABLE porn_messages
(
    id int not null AUTO_INCREMENT,
    senderid varchar(32) not null,
    message varchar(1024) not null,
    -- confidence float not null,
    time_stamp varchar(32) not null,
    PRIMARY KEY (id)
);

CREATE TABLE normal_messages
(
    id int not null AUTO_INCREMENT,
    senderid varchar(32) not null,
    message varchar(1024) not null,
    time_stamp varchar(32) not null,
    PRIMARY KEY (id)
);

CREATE TABLE blacklist
(
    ign varchar(32) not null,
    uuid varchar(32) not null,
    reason varchar(1024) not null,
    cheater boolean not null,
    time_stamp varchar(32) not null
);

CREATE TABLE punishments
(
    id int not null AUTO_INCREMENT,
    discord_id varchar(32) not null,
    punishment varchar(128) not null,
    reason varchar(1024) not null,
    time_stamp varchar(32) not null,
    punishment_link varchar(128) not null,
    PRIMARY KEY (id)
);

CREATE TABLE applications
(
    id int not null AUTO_INCREMENT,
    discord_id varchar(32) not null,
    ign varchar(32) not null,
    uuid varchar(32) not null,
    time_stamp varchar(32) not null,
    guild varchar(32) not null,
    application_status varchar(32) not null,
    application_channel varchar(32) not null,
    PRIMARY KEY (id)
);

CREATE TABLE current_punishments (
    id INT AUTO_INCREMENT PRIMARY KEY,
    user_id VARCHAR(32) NOT NULL,
    guild_id VARCHAR(32) NOT NULL,
    end_time BIGINT NOT NULL,
    reason TEXT,
    punishment_type VARCHAR(32) NOT NULL,
    INDEX (end_time)
);

CREATE TABLE guild_member_data (
    id INT AUTO_INCREMENT PRIMARY KEY,
    guild_id VARCHAR(32) NOT NULL,
    username VARCHAR(32) NOT NULL,
    user_id VARCHAR(32) NOT NULL,
    time_stamp BIGINT NOT NULL,
    lily_weight INT NOT NULL,
    skyblock_xp INT NOT NULL,
    farming_xp FLOAT NOT NULL,
    current_snapshot TINYINT(1) NOT NULL DEFAULT 0,
    INDEX (time_stamp)
);

CREATE TABLE tracked_member_data (
    id INT AUTO_INCREMENT PRIMARY KEY,
    username VARCHAR(32) NOT NULL,
    user_id VARCHAR(32) NOT NULL,
    time_stamp BIGINT NOT NULL,
    farming_xp FLOAT NOT NULL,
    tracking_session_id VARCHAR(64) NOT NULL,
    INDEX (time_stamp),
    INDEX (tracking_session_id)
);

CREATE TABLE active_tracking_sessions (
    id INT AUTO_INCREMENT PRIMARY KEY,
    session_id VARCHAR(64) UNIQUE NOT NULL,
    user_id VARCHAR(32) NOT NULL,
    username VARCHAR(32) NOT NULL,
    start_time BIGINT NOT NULL,
    end_time BIGINT NOT NULL,
    channel_id VARCHAR(32) NOT NULL,
    api_key VARCHAR(64) NOT NULL,
    last_check BIGINT DEFAULT 0,
    INDEX (end_time),
    INDEX (session_id)
);

-- Create users
DROP USER IF EXISTS 'imsbotdb-read-only';
DROP USER IF EXISTS 'imsbotdb-read-write';

CREATE USER 'imsbotdb-read-only' IDENTIFIED BY 'imsbot-read';
CREATE USER 'imsbotdb-read-write' IDENTIFIED BY 'imsbot-read-write';

GRANT SELECT, SHOW VIEW ON imsbot.* 
      TO 'imsbotdb-read-only';
GRANT SELECT, SHOW VIEW, INSERT, UPDATE, DELETE, DROP, CREATE, ALTER ON imsbot.* 
      TO 'imsbotdb-read-write';
      
FLUSH PRIVILEGES;


CREATE TABLE events (
    id INT AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(128) NOT NULL,
    event_type VARCHAR(64) NOT NULL DEFAULT 'VANGUARD_CORPSE',
    status VARCHAR(16) NOT NULL,
    is_active TINYINT(1) NOT NULL DEFAULT 0,
    active_singleton TINYINT GENERATED ALWAYS AS (CASE WHEN is_active = 1 THEN 1 ELSE NULL END) STORED,
    created_at BIGINT NOT NULL,
    started_at BIGINT DEFAULT NULL,
    ending_started_at BIGINT DEFAULT NULL,
    ended_at BIGINT DEFAULT NULL,
    UNIQUE KEY uniq_active_event (active_singleton),
    INDEX (status),
    INDEX (event_type, created_at)
);

CREATE TABLE event_participants (
    id INT AUTO_INCREMENT PRIMARY KEY,
    event_id INT NOT NULL,
    discord_user_id VARCHAR(32) NOT NULL,
    minecraft_uuid VARCHAR(32) NOT NULL,
    minecraft_username VARCHAR(32) NOT NULL,
    profile_id VARCHAR(36) DEFAULT NULL,
    signup_corpse_count INT DEFAULT NULL,
    signup_overall_corpse_count BIGINT DEFAULT NULL,
    signup_glacite_powder BIGINT DEFAULT NULL,
    signup_lapis_corpse_count BIGINT DEFAULT NULL,
    signup_tungsten_corpse_count BIGINT DEFAULT NULL,
    signup_umber_corpse_count BIGINT DEFAULT NULL,
    signup_glacite_powder_available BIGINT DEFAULT NULL,
    signup_glacite_powder_spent BIGINT DEFAULT NULL,
    signup_at BIGINT NOT NULL,
    UNIQUE KEY uniq_event_discord_user (event_id, discord_user_id),
    UNIQUE KEY uniq_event_minecraft_uuid (event_id, minecraft_uuid),
    INDEX (event_id)
);

CREATE TABLE event_snapshot_runs (
    id INT AUTO_INCREMENT PRIMARY KEY,
    event_id INT NOT NULL,
    snapshot_type VARCHAR(16) NOT NULL,
    snapshot_bucket VARCHAR(32) DEFAULT NULL,
    status VARCHAR(16) NOT NULL,
    batch_size INT NOT NULL,
    batch_delay_ms BIGINT NOT NULL,
    started_at BIGINT NOT NULL,
    next_batch_at BIGINT NOT NULL,
    completed_at BIGINT DEFAULT NULL,
    total_participants INT NOT NULL DEFAULT 0,
    succeeded_count INT NOT NULL DEFAULT 0,
    failed_count INT NOT NULL DEFAULT 0,
    last_error TEXT,
    UNIQUE KEY uniq_snapshot_bucket (event_id, snapshot_type, snapshot_bucket),
    INDEX (event_id, status),
    INDEX (status, next_batch_at),
    INDEX (event_id, snapshot_type, started_at)
);

CREATE TABLE event_snapshot_tasks (
    id INT AUTO_INCREMENT PRIMARY KEY,
    snapshot_run_id INT NOT NULL,
    participant_id INT NOT NULL,
    status VARCHAR(16) NOT NULL,
    attempt_count INT NOT NULL DEFAULT 0,
    available_at BIGINT NOT NULL,
    claimed_at BIGINT DEFAULT NULL,
    last_attempt_at BIGINT DEFAULT NULL,
    completed_at BIGINT DEFAULT NULL,
    claim_token VARCHAR(64) DEFAULT NULL,
    failure_code VARCHAR(64) DEFAULT NULL,
    failure_message TEXT,
    UNIQUE KEY uniq_snapshot_run_participant (snapshot_run_id, participant_id),
    INDEX (snapshot_run_id, status, available_at),
    INDEX (status, available_at),
    INDEX (claim_token)
);

CREATE TABLE event_snapshots (
    id INT AUTO_INCREMENT PRIMARY KEY,
    snapshot_run_id INT NOT NULL,
    event_id INT NOT NULL,
    participant_id INT NOT NULL,
    snapshot_type VARCHAR(16) NOT NULL,
    corpse_count INT NOT NULL,
    overall_corpse_count BIGINT DEFAULT NULL,
    glacite_powder BIGINT DEFAULT NULL,
    lapis_corpse_count BIGINT DEFAULT NULL,
    tungsten_corpse_count BIGINT DEFAULT NULL,
    umber_corpse_count BIGINT DEFAULT NULL,
    glacite_powder_available BIGINT DEFAULT NULL,
    glacite_powder_spent BIGINT DEFAULT NULL,
    captured_at BIGINT NOT NULL,
    is_final_snapshot TINYINT(1) NOT NULL DEFAULT 0,
    UNIQUE KEY uniq_snapshot_result (snapshot_run_id, participant_id),
    INDEX (event_id, participant_id, captured_at),
    INDEX (event_id, snapshot_type, captured_at)
);
