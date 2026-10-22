# Astra Player

Astra Player is a lightweight, offline-first media server and web player designed specifically for Android (Termux) and low-resource environments. It indexes local video files and streams them directly to your browser using chunk-based media requests without putting heavy load on memory or CPU.

---

## Key Features

- Low Memory Footprint: Idles between 30 MB to 45 MB of RAM, preventing background process termination on Android devices.
- Partial Content Streaming: Uses native HTTP range requests (HTTP 206) with 4 MB pre-buffer chunks, allowing fast seeking without buffering full video files into memory.
- Text-Driven Studio UI: A responsive, dark-themed dashboard that does not rely on heavy external image APIs or thumbnail generation.
- Offline Watch Progress: Automatically saves and syncs playback progress and timestamps to a local data file.
- Custom Subtitle Integration: Attach local subtitle files (.vtt, .srt) directly or map downloaded tracks per episode.
- Integrated System Diagnostics: Real-time RAM and server uptime telemetry on the settings panel.
- Vanilla Frontend Architecture: Built with clean JavaScript, HTML5, and CSS, requiring no client-side frameworks.

---

## Prerequisites

Ensure you have Node.js, Git, and storage access configured inside Termux:

    pkg update && pkg install nodejs git -y
    termux-setup-storage

---

## Installation & Setup

1. Clone the repository:

       git clone [https://github.com/](https://github.com/)<your-username>/astra-player.git
       cd astra-player

2. Install dependencies:

       npm install

3. Start the engine:

       node server.js

4. Access the interface:
   Open your preferred browser on the device and visit:

       http://localhost:3000

---

## Storage Configuration

Astra Player scans directories in the following order by default:
- ~/storage/shared/anime
- /sdcard/anime
- ~/storage/shared

To target a different directory on your storage, update the root path directly from the in-app Launcher Settings tab and select Save & Scan.

---

## Disclaimer

Astra Player is strictly a personal media server software engine. It does not distribute, host, scrape, or index copyrighted video files. Users are solely responsible for providing their own legally obtained media content.

---

## License

This project is open-source software licensed under the MIT License.
