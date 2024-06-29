CREATE DATABASE IF NOT EXISTS imsbot;

USE imsbot;

DROP TABLE IF EXISTS tracks;
DROP TABLE IF EXISTS porn_messages;
DROP TABLE IF EXISTS normal_messages;

CREATE TABLE tracks
(
    id int not null AUTO_INCREMENT,
    targetid varchar(32) not null,
    notification_to varchar(32) not null,   -- where the discord bot should notify
    notification_style varchar(32) not null, -- either DM or Channel
    PRIMARY KEY (id)
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


-- Create users
DROP USER IF EXISTS 'imsbotdb-read-only';
DROP USER IF EXISTS 'imsbotdb-read-write';

CREATE USER 'imsbotdb-read-only' IDENTIFIED BY 'imsbot-read';
CREATE USER 'imsbotdb-read-write' IDENTIFIED BY 'imsbot-read-write';

GRANT SELECT, SHOW VIEW ON discordapp.* 
      TO 'imsbotdb-read-only';
GRANT SELECT, SHOW VIEW, INSERT, UPDATE, DELETE, DROP, CREATE, ALTER ON discordapp.* 
      TO 'imsbotdb-read-write';
      
FLUSH PRIVILEGES;