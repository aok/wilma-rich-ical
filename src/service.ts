import { execSync } from 'node:child_process'

const LAUNCHD_LABEL = 'com.wilma-rich-ical'
const LAUNCHD_PLIST_PATH = `/Library/LaunchDaemons/${LAUNCHD_LABEL}.plist`
const SYSTEMD_UNIT = 'wilma-icald'

export function serviceRestart() {
  if (process.platform === 'darwin') {
    try {
      execSync('pgrep -f "node.*wilma-rich-ical.*cli"', { encoding: 'utf8' })
      execSync('pkill -f "node.*wilma-rich-ical.*cli"')
      console.log('Service process killed. launchd will restart it automatically.')
    } catch {
      console.log('No running wilma-icald process found.')
    }
  } else if (process.platform === 'linux') {
    execSync(`systemctl --user restart ${SYSTEMD_UNIT}`, { stdio: 'inherit' })
  } else {
    unsupported()
  }
}

export function serviceStop() {
  if (process.platform === 'darwin') {
    console.log('To stop the daemon, an admin must run:')
    console.log(`  sudo launchctl unload ${LAUNCHD_PLIST_PATH}`)
  } else if (process.platform === 'linux') {
    execSync(`systemctl --user stop ${SYSTEMD_UNIT}`, { stdio: 'inherit' })
  } else {
    unsupported()
  }
}

function unsupported(): never {
  console.error(`Service management not supported on ${process.platform}.`)
  process.exit(1)
}

export { LAUNCHD_LABEL, LAUNCHD_PLIST_PATH, SYSTEMD_UNIT }
