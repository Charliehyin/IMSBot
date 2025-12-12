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
