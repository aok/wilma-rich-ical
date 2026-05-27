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
- An LLM API key (Anthropic or OpenAI)
- A Wilma guardian (huoltaja) account

## Quick start (no install, no sudo, no Cloudflare account)

```bash
npx wilma-icald setup
```

Setup authenticates with Wilma, asks for your LLM key, and (leave the tunnel hostname blank) starts the server as a detached process with a temporary [quick tunnel](https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/do-more-with-tunnels/trycloudflare/) URL. State files (`.env`, `data/`, `wilma.log`, `calendar-urls.txt`) are written to the current directory. The quick-tunnel URL changes on every restart and the process does not survive a reboot — good for trying it out.

## Persistent server

For a stable URL that survives reboots, install into a dedicated directory so the service points at a stable path:

```bash
mkdir wilma-icald && cd wilma-icald
npm install wilma-icald
npx wilma-icald setup     # enter a Cloudflare tunnel hostname when prompted
```

Upgrade later with:

```bash
npm install wilma-icald@latest && npx wilma-icald restart
```

`setup` authenticates with Wilma, asks for your LLM key and the Cloudflare tunnel hostname, then writes `.env` and a service plist/unit. (Running `setup` for a persistent service via `npx` is refused — npx's cache is temporary, so the service path would not survive; install locally first as above.)

### Cloudflare tunnel (requires Cloudflare account)

For a stable URL that survives reboots:

1. Create a tunnel in the [Cloudflare Zero Trust dashboard](https://one.dash.cloudflare.com/) (Networks → Tunnels)
2. Add a public hostname (e.g. `wilma.example.com`) pointing to `http://localhost:3456`
3. Install cloudflared on the server: `sudo cloudflared service install <token>`
4. Run `npx wilma-icald setup` and enter the tunnel hostname

On **Linux**, setup installs a user-level systemd unit — no sudo needed.

On **macOS**, setup writes a launchd plist. If you have sudo, it installs automatically. If setup runs as a non-admin user, it prints the commands for an admin to run:

```bash
sudo cp wilma-icald.plist /Library/LaunchDaemons/com.wilma-rich-ical.plist
sudo launchctl unload /Library/LaunchDaemons/com.wilma-rich-ical.plist 2>/dev/null
sudo launchctl load /Library/LaunchDaemons/com.wilma-rich-ical.plist
```

After the service is installed:

```bash
npx wilma-icald restart  # restart with new code (no sudo needed)
```

The daemon has `KeepAlive: true`, so `restart` simply kills the process and launchd/systemd restarts it automatically. Logs go to `wilma.log`. The server refreshes feeds every 30 minutes (configurable via `REFRESH_INTERVAL`).

## Subscribing

The server writes calendar URLs to `calendar-urls.txt` on startup.

In Apple Calendar: File → New Calendar Subscription → paste the URL.

## Security

The server binds to `127.0.0.1` only — it is not directly reachable from the network. All public access goes through the Cloudflare tunnel. Only requests with a valid 64-character hex token get a response; everything else returns 404.
