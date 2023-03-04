#!/usr/bin/env zx

import { existsSync } from 'fs';
import { readdir, writeFile } from 'fs/promises';
import { resolve } from 'path';
import { exit } from 'process';

// Configure the script
let playlist_config = {
    playlist_id: process.env.PLAYLIST_ID ?? 'PL7siVIUmPpIG-m0oTKne3eaSixyUzGFPs', // Default PL7siVIUmPpIG-m0oTKne3eaSixyUzGFPs
    format: process.env.PREFERRED_FORMAT ?? 'webm'                                // Default webm
};

let ssh_config = {
    port: process.env.SSH_PORT ?? 22,  // Default 22
}; 

let scp_path = process.env.SCP_PATH ?? playlist_config.playlist_id; // Default ${playlist_config.playlist_id}

const app_config = {
    // Define software that should be installed localy / manually
    localSoftware: ['youtube-dl', 'ffmpeg'],
    appDirectory: resolve(process.env.HOME, '.yt-playlist-synchronizer')
}

// Make sure the app directory does exist
await $`mkdir -p ${app_config.appDirectory}`;
await $`mkdir -p ${resolve(app_config.appDirectory, 'bin')}`;

// Make sure we have required SSH configuration
if (!  process.env.SSH_HOST || ! ssh_config.SSH_PORT || ! process.env.SSH_USER || ! (process.env.SSH_KEY || process.env.SSH_PASSWORD)) {
    console.error('SSH parameters not configured correctly. Make sure you specify SSH_HOST, SSH_PORT (default 22), SSH_USERNAME as well as SSH_KEY OR SSH_PASSWORD.');
    exit(1);
}

// Set SSHPASS to SSH_PASSWORD since sshpass requires it like so
if (process.env.SSH_PASSWORD) {
    process.env.SSHPASS = process.env.SSH_PASSWORD
}

// Make sure we have required SCP configuration
if (! scp_path) {
    console.error('SCP parameters not configured correctly. Make sure you specify SCP_PATH.');
    exit(1);
}

function ssh() {
    let command = [];

    // Add sshpass if password is provided instead of key
    if (! process.env.SSH_KEY && process.env.SSH_PASSWORD) {
        command.push('sshpass', '-e');
    }

    // Add the basic command
    command.push('ssh', '-o', 'StrictHostKeyChecking=no', '-p', `${ssh_config.port}`);

    // Add private key if key is provided instead of password
    if (! process.env.SSH_PASSWORD && process.env.SSH_KEY) {
        command.push('-i', `${resolve(process.env.SSH_KEY)}`);
    }

    // Return the built command
    return command;
}

function scp() {
    let command = [];

    // Add sshpass if password is provided instead of key
    if (! process.env.SSH_KEY && process.env.SSH_PASSWORD) {
        command.push('sshpass', '-e');
    }

    // Add the basic command
    command.push('scp', '-P', `${ssh_config.port}`);

    // Add private key if key is provided instead of password
    if (! process.env.SSH_PASSWORDn && process.env.SSH_KEY) {
        command.push('-i', `${resolve(process.env.SSH_KEY)}`);
    }

    // Return the built command
    return command;
}

async function installed(software) {
    if (app_config.localSoftware.includes(software)) {
        return existsSync(resolve(app_config.appDirectory, 'bin', software));
    } else {
        return (await nothrow($`which ${software}`)).stdout.length
    }
}


// Install YouTube-DL
if (! await installed('youtube-dl')) {
    // Download latest yt-dlp and store it in /usr/local/bin
    await fetch('https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp')
        .then(response => response.body)
        .then(body => writeFile(resolve(app_config.appDirectory, 'bin', 'youtube-dl'), body))
        .then(() => $`chmod +x ${resolve(app_config.appDirectory, 'bin', 'youtube-dl')}`)
}

// Install FFMPEG
if (! await installed('ffmpeg')) {
    const tmp = (await $`mktemp -d`).stdout.replace( /[\r\n]+/gm, "" );

    // Download latest FFMPEG custom build archive for yt-dlp
    await fetch('https://github.com/yt-dlp/FFmpeg-Builds/releases/download/latest/ffmpeg-master-latest-linux64-gpl.tar.xz')
        .then(response => response.body)
        .then(body => writeFile(resolve(tmp, 'ffmpeg.tar.xz'), body))
    
    // Extract the binaries to /usr/local/bin/
    for (const file of ['ffmpeg', 'ffplay', 'ffprobe']) {
        // Extract specific file
        await $`sudo tar \
            --strip=2 \
            --file ${resolve(tmp, 'ffmpeg.tar.xz')} \
            --directory ${resolve(app_config.appDirectory, 'bin')} \
            --wildcards \
            --no-anchored \
            --extract "*${file}"`;

        // Make sure the binaries are executable
        await $`sudo chmod +x ${resolve(app_config.appDirectory, 'bin', file)}`
    }
    
}

// Install sshpass
if (! await installed('sshpass')) {
    // Install sshpass using apt
    await $`sudo apt-get update`
    await $`sudo apt-get install -y sshpass`
}

// Make sure $HOME/.local/bin is in path
//$`export PATH="$HOME/.local/bin:$PATH"`

// Create a new, clean temoprary working directory
const workingDirectory = (await $`mktemp -d`).stdout.replace( /[\r\n]+/gm, "" );
console.log(`Created temporary working directory at ${workingDirectory}`);

// Fetch the list of existing files
const regex = new RegExp(`Die Geschichte des Drachenlord.*.${playlist_config.format}`);
const existing = (await $`${ssh()} $SSH_USERNAME@$SSH_HOST ls -l \"'${scp_path.split(' ')}'\"`).stdout
    .split('\n')
    .filter(line => line.includes(`.${playlist_config.format}`))
    .map(line => {
        const match = regex.exec(line);
        if (match !== null) {
            return match[0];
        }
    })
console.log('Fetched existing episodes.');

// Create placeholders for existing episodes
for (const episode of existing) {
    // Create placeholder so YouTube-DL will not download the file again
    console.log(`Creating placeholder for episode ${episode}`)
    await $`touch ${resolve(workingDirectory, episode)}`;
}

// Download missing episodes to workingDirectory
await cd(resolve(workingDirectory));
try {
    await $`${resolve(app_config.appDirectory, 'bin', 'youtube-dl')} \
        -f bestvideo[ext=${playlist_config.format}]+bestaudio[ext=${playlist_config.format}]/best[ext=${playlist_config.format}] \
        --ffmpeg-location ${resolve(app_config.appDirectory, 'bin')} \
        --ignore-errors \
        https://www.youtube.com/playlist?list=${playlist_config.playlist_id}`;
} catch (e) {}

const newEpisodes = (await readdir(resolve(workingDirectory))).filter(episode => ! existing.includes(episode));

// Check if there are new episodes
if (newEpisodes.length) {
    // Output an informational header
    console.log(`Uploading new episodes:`)
    console.log('#######################')

    // Upload new episodes
    for (const episode of newEpisodes) {
        // Upload the episode using scp
        await $`${scp()} ${episode} $SSH_USERNAME@$SSH_HOST:'"${scp_path.split(' ')}/"'`;

        // Add seperator
        console.log('#######################');
    }

    console.log(`Successfully uploaded ${newEpisodes.length} new/missing episode${newEpisodes.length > 1 ? 's' : ''}!`);
} else {
    console.log('No new episodes in playlist to upload.')
}
