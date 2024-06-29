USE imsbot;

-- Create users
DROP USER IF EXISTS 'imsbotdb-read-only';
DROP USER IF EXISTS 'imsbotdb-read-write';

CREATE USER 'imsbotdb-read-only' IDENTIFIED BY 'imsbot-read';
CREATE USER 'imsbotdb-read-write' IDENTIFIED BY 'imsbot-read-write';

GRANT SELECT, SHOW VIEW ON imsbot.* 
      TO 'imsbotdb-read-only';
GRANT SELECT, SHOW VIEW, INSERT, UPDATE, DELETE, DROP, CREATE, ALTER ON imsbot.* 
      TO 'imsbotdb-read-write';