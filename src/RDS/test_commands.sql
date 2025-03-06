USE imsbot;

SELECT * FROM applications a
WHERE a.application_status = 'open'
ORDER BY a.time_stamp DESC;
