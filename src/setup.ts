import { existsSync, mkdirSync, openSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { homedir } from 'node:os'
import { randomBytes } from 'node:crypto'
import { execSync, spawn } from 'node:child_process'
import { createInterface } from 'node:readline'
import { fileURLToPath } from 'node:url'
import { LAUNCHD_LABEL, LAUNCHD_PLIST_PATH, SYSTEMD_UNIT } from './service.js'

function wilmaConfigPath(): string {
  const base = process.env['XDG_CONFIG_HOME'] ?? join(homedir(), '.config')
  return join(base, 'wilmai', 'config.json')
}

function ask(rl: ReturnType<typeof createInterface>, question: string): Promise<string> {
  return new Promise(resolve => rl.question(question, resolve))
}

async function main() {
  const rl = createInterface({ input: process.stdin, output: process.stdout })

  try {
    if (!existsSync(wilmaConfigPath())) {
      console.log('No Wilma credentials found. Starting wilma CLI setup...\n')
      execSync('npx wilma', { stdio: 'inherit' })
      console.log()
    }

    if (!existsSync(wilmaConfigPath())) {
      console.error('Wilma setup did not complete. Run `npx wilma` manually, then retry.')
      process.exit(1)
    }

    const config = JSON.parse(readFileSync(wilmaConfigPath(), 'utf8'))
    const students = new Set<string>()
    for (const profile of config.profiles) {
      for (const s of profile.students) {
        students.add(s.name.split(' ')[0])
      }
    }

    console.log(`Found students: ${[...students].join(', ')}\n`)

    const provider = (await ask(rl, 'LLM provider (anthropic/openai) [anthropic]: ')).trim() || 'anthropic'
    const keyName = provider === 'openai' ? 'OPENAI_API_KEY' : 'ANTHROPIC_API_KEY'
    const apiKey = (await ask(rl, `${keyName}: `)).trim()
    if (!apiKey) {
      console.error('API key is required.')
      process.exit(1)
    }

    const port = (await ask(rl, 'Port [3456]: ')).trim() || '3456'

    console.log('\nCloudflare tunnel (optional):')
    console.log('  For a stable public URL, enter the hostname you configured in the')
    console.log('  Cloudflare Zero Trust dashboard (Networks → Tunnels → Public Hostname).')
    console.log('  This also installs a persistent system service (requires sudo).')
    console.log('  Leave blank for a quick tunnel that works without sudo.\n')

    const tunnelHostname = (await ask(rl, 'Tunnel hostname (e.g. wilma.example.com): ')).trim()

    const lines = [
      `LLM_PROVIDER=${provider}`,
      `${keyName}=${apiKey}`,
      '',
      `PORT=${port}`,
      'REFRESH_INTERVAL=30',
      'TZ=Europe/Helsinki',
      '',
    ]

    if (tunnelHostname) {
      lines.push(`TUNNEL_HOSTNAME=${tunnelHostname}`)
    } else {
      lines.push('# Stable public URL via Cloudflare tunnel:')
      lines.push('# TUNNEL_HOSTNAME=wilma.example.com')
    }
    lines.push('')

    for (const name of students) {
      const token = randomBytes(32).toString('hex')
      lines.push(`TOKEN_${name.toUpperCase()}=${token}`)
    }

    writeFileSync('.env', lines.join('\n') + '\n')
    console.log('\n.env written.')

    installService(!!tunnelHostname)
  } finally {
    rl.close()
  }
}

function installService(persistent: boolean) {
  const cliPath = resolve(dirname(fileURLToPath(import.meta.url)), 'cli.js')
  const nodePath = process.execPath
  const workDir = process.cwd()
  const logPath = join(workDir, 'wilma.log')

  if (persistent) {
    if (process.platform === 'darwin') {
      installLaunchdDaemon(nodePath, cliPath, workDir, logPath)
    } else if (process.platform === 'linux') {
      installSystemdUnit(nodePath, cliPath, workDir, logPath)
    } else {
      console.log(`Persistent service not supported on ${process.platform}.`)
    }
  } else {
    startDetached(nodePath, cliPath, workDir, logPath)
  }
}

function installLaunchdDaemon(nodePath: string, cliPath: string, workDir: string, logPath: string) {
  const plistPath = LAUNCHD_PLIST_PATH
  const username = execSync('whoami').toString().trim()
  const nodeBinDir = dirname(nodePath)

  const plist = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>${LAUNCHD_LABEL}</string>
  <key>UserName</key>
  <string>${username}</string>
  <key>ProgramArguments</key>
  <array>
    <string>${nodePath}</string>
    <string>${cliPath}</string>
  </array>
  <key>WorkingDirectory</key>
  <string>${workDir}</string>
  <key>RunAtLoad</key>
  <true/>
  <key>KeepAlive</key>
  <true/>
  <key>StandardOutPath</key>
  <string>${logPath}</string>
  <key>StandardErrorPath</key>
  <string>${logPath}</string>
  <key>EnvironmentVariables</key>
  <dict>
    <key>PATH</key>
    <string>${join(workDir, 'node_modules', '.bin')}:${nodeBinDir}:/usr/local/bin:/opt/homebrew/bin:/usr/bin:/bin</string>
  </dict>
</dict>
</plist>
`

  const localPlist = join(workDir, 'wilma-icald.plist')
  writeFileSync(localPlist, plist)

  console.log(`\nService plist written to ${localPlist}`)
  console.log('To install (run as admin or with sudo):')
  console.log(`  sudo cp ${localPlist} ${plistPath}`)
  console.log(`  sudo launchctl unload ${plistPath} 2>/dev/null`)
  console.log(`  sudo launchctl load ${plistPath}`)
  console.log('')
  console.log('After installing:')
  console.log('  wilma-icald restart  # restart with new code (no sudo needed)')
  console.log(`  tail -f ${logPath}   # view logs\n`)
}

function installSystemdUnit(nodePath: string, cliPath: string, workDir: string, logPath: string) {
  const unitDir = join(homedir(), '.config', 'systemd', 'user')
  const unitPath = join(unitDir, `${SYSTEMD_UNIT}.service`)

  const unit = `[Unit]
Description=wilma-icald calendar server

[Service]
ExecStart=${nodePath} ${cliPath}
WorkingDirectory=${workDir}
Restart=on-failure
StandardOutput=append:${logPath}
StandardError=append:${logPath}

[Install]
WantedBy=default.target
`

  mkdirSync(unitDir, { recursive: true })
  writeFileSync(unitPath, unit)
  execSync('systemctl --user daemon-reload')
  execSync(`systemctl --user enable --now ${SYSTEMD_UNIT}`)

  console.log(`\nService installed and started.`)
  console.log('Useful commands:')
  console.log('  wilma-icald restart  # restart with new code')
  console.log(`  tail -f ${logPath}   # view logs\n`)
}

function startDetached(nodePath: string, cliPath: string, _workDir: string, logPath: string) {
  const out = openSync(logPath, 'a')
  const child = spawn(nodePath, [cliPath], {
    detached: true,
    stdio: ['ignore', out, out],
  })
  child.unref()
  console.log(`\nwilma-icald started (pid ${child.pid}, quick tunnel).`)
  console.log('This process will not survive a reboot.')
  console.log('For a persistent service, re-run setup with a tunnel hostname.\n')
  console.log(`  tail -f ${logPath}  # view logs\n`)
}

export { main }
