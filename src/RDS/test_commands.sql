USE imsbot;

-- Add api_key column to active_tracking_sessions table
ALTER TABLE active_tracking_sessions ADD COLUMN api_key VARCHAR(64) NOT NULL DEFAULT '';

-- Verify the change
SHOW COLUMNS FROM active_tracking_sessions; 