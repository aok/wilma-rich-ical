# wilma-icald

Self-hosted server that builds enriched iCal feeds from Wilma data. Homework, exams, schedule, and teacher notes appear directly in your calendar app.

## How it works

1. Authenticates with Wilma via the `wilma` CLI
2. Fetches each student's weekly schedule and caches it (so the feed grows over time)
3. Fetches Wilma messages and processes them with an LLM
4. Builds a complete iCal feed per child:
   - **Schedule** — timed events from the cached timetable
   - **Annotations** — teacher message refers to a specific lesson → note added to that event's description
   - **Homework** — annotated on the next class of that subject (homework date = given date, due = next class)
   - **Exams** — annotated on the first class of that subject on the exam date
   - **Synthetic events** — events mentioned in messages but not on the timetable
5. Serves one iCal feed per child at `GET /feed/<token>/calendar.ics`

## Prerequisites

- Node.js 20+
- A Wilma guardian (huoltaja) account
- An LLM API key — [Anthropic](https://console.anthropic.com/) or [OpenAI](https://platform.openai.com/api-keys)

(`cloudflared` is bundled for the quick-start mode — see [Persistent server](#persistent-server) below for the system-service version you'll need for a stable URL.)

## Quick start (no Cloudflare account, no sudo)

```bash
mkdir wilma-trial && cd wilma-trial
npx wilma-icald setup
```

Setup authenticates with Wilma, asks for your LLM key, and (leave the tunnel hostname blank) starts the server with a temporary [quick tunnel](https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/do-more-with-tunnels/trycloudflare/) URL. The first run downloads a bundled `cloudflared` binary (~25 MB) on demand — no separate install needed. The quick-tunnel URL is written to `wilma.log`, changes on every restart, and the process doesn't survive a reboot — good for trying it out. State files (`.env`, `data/`, `wilma.log`, `calendar-urls.txt`) land in the current directory, which is why a fresh dir is recommended.

## Persistent server

For a stable URL that survives reboots, you need a Cloudflare account plus `cloudflared` installed as a system service on the host.

### 1. Set up the Cloudflare tunnel

1. Install `cloudflared` on the host:
   - **macOS**: `brew install cloudflared`
   - **Linux**: see [Cloudflare's downloads page](https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/downloads/)
2. In the [Cloudflare Zero Trust dashboard](https://one.dash.cloudflare.com/), go to **Networks → Tunnels → Create a tunnel**, name it, and copy the **tunnel token** shown in the install step (a long string starting with `eyJ…`).
3. Add a **Public Hostname** to the tunnel (e.g. `wilma.example.com`) pointing to `http://localhost:3456`.
4. Install cloudflared as a system service on the host, using the token:
   ```bash
   sudo cloudflared service install <tunnel-token>
   ```

### 2. Install and run wilma-icald

Install into a dedicated directory so the service has a stable path:

```bash
mkdir wilma-icald && cd wilma-icald
npm install wilma-icald
npx wilma-icald setup     # enter your tunnel hostname (e.g. wilma.example.com) when prompted
```

`setup` writes `.env` and a service plist/unit in the current directory. (Running `setup` for a persistent service via `npx` is refused — npx's cache is temporary, so the service path would not survive; install locally first as above.)

On **Linux**, setup installs a user-level systemd unit and starts it — no sudo needed.

On **macOS**, setup writes `wilma-icald.plist` in the current directory and prints the sudo commands to install it as a LaunchDaemon:

```bash
sudo cp wilma-icald.plist /Library/LaunchDaemons/com.wilma-rich-ical.plist
sudo launchctl unload /Library/LaunchDaemons/com.wilma-rich-ical.plist 2>/dev/null
sudo launchctl load /Library/LaunchDaemons/com.wilma-rich-ical.plist
```

After the service is installed, upgrade and restart with no sudo:

```bash
npm install wilma-icald@latest && npx wilma-icald restart
```

The daemon has `KeepAlive: true`, so `restart` simply kills the process and launchd/systemd restarts it automatically. Logs go to `wilma.log`. The server refreshes feeds every 30 minutes (configurable via `REFRESH_INTERVAL`).

## Subscribing

The server writes calendar URLs to `calendar-urls.txt` on startup.

In Apple Calendar: File → New Calendar Subscription → paste the URL.

## Security

The server binds to `127.0.0.1` only — it is not directly reachable from the network. All public access goes through the Cloudflare tunnel. Only requests with a valid 64-character hex token get a response; everything else returns 404.
