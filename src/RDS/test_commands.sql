USE imsbot;

DROP TABLE blacklist;

CREATE TABLE blacklist
(
    discord_id varchar(32) not null,
    ign varchar(32) not null,
    uuid varchar(32) not null,
    reason varchar(1024) not null,
    cheater boolean not null,
    time_stamp varchar(32) not null
);
