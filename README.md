# youtube-playlist-synchronizer
ZX Script to download &amp; upload videos in a YouTube Playlist to an external storage using SSH. SCP, YT-DLP and FFMPEG.

The script does:
1) Install YT-DLP & FFMPEG into application folder
2) Install sshpass via apt if password is being used
3) Get the list of existing files on the remote
4) Download missing files from the playlist
4) Upload videos to the configured remote via scp

# Usage
Make sure you have Google ZX installed on your system:
```
npm i -g zx
```

To configure the script you will have to define the following environment variables:
```
PLAYLIST_ID
SSH_HOST
SSH_USERNAME
```

You **must** define **ONE** of the following environment variables
```
SSH_PASSWORD
SSH_KEY
```

You can also define the following environment variables
```
PREFERRED_FORMAT=webm
SSH_PORT=22
SCP_PATH="${PLAYLIST_ID}"
```

Now you can run the script with the following command:
```bash
# If ZX is in the path / env just run the script
./youtube-playlist-synchronizer.mjs

# Or specify ZX to run the script
zx ./youtube-playlist-synchronizer.mjs
```
