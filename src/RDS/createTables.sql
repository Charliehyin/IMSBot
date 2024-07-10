CREATE DATABASE IF NOT EXISTS imsbot;

USE imsbot;

-- DROP TABLE IF EXISTS porn_messages;
-- DROP TABLE IF EXISTS normal_messages;
-- DROP TABLE IF EXISTS members;
-- DROP TABLE IF EXISTS blacklist;
-- DROP TABLE IF EXISTS punishments;
-- DROP TABLE IF EXISTS applications;

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