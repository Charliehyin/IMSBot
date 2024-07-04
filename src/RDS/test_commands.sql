USE imsbot;

DROP TABLE punishments;

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
