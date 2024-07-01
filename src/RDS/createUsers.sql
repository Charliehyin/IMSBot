USE imsbot;

-- Create users
CREATE TABLE members
(
    discord_id varchar(32) not null,
    discord_username varchar(32) not null,
    ign varchar(32) not null,
    uuid varchar(32) not null
);