The database consists of two tables: tracks, and track_key_words:

tracks(PRIMARY_KEY(id), setterid, targetid, notification_to, notification_style)

setterid - person who set up the bot to track the targetid
targetid - person who the bot is set to track and note information
notification_to - where the bot should notify what has been said
notification_style - either DM or channel depending on where you want the bot to send it to
search_mechanism - how you want the bot to search for the text, either through a simple keyword search or an advanced ML search

track_key_words(PRIMARY_KEY(id), trackid, keyword)

trackid - foreign key referencing the track id
keyword - list of keywords the bot search search for
