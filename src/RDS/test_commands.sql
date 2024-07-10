USE imsbot;

DROP TABLE applications;

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