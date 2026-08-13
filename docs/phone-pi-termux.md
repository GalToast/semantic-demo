# Phone Pi Runner

Pi `0.84.1` is installed in Termux on the rooted OnePlus 7T Pro (`aarch64`, Android 10).
The phone uses Node `v26.4.0` and a Termux-native launcher at:

```text
/data/data/com.termux/files/usr/bin/pi
```

## Start Pi on the phone

Open Termux and run:

```bash
export PREFIX=/data/data/com.termux/files/usr
export PATH="$PREFIX/bin:/system/bin:/system/xbin"
pi
```

The launcher sets this path itself, but setting it in a shell also makes `node`, `npm`,
and other Termux commands resolve consistently.

## USB control and router access

The phone's Termux SSH daemon listens on port `8022`. With the phone connected over
USB, the host can forward a local port to it:

```powershell
adb forward tcp:18022 tcp:8022
ssh -p 18022 u0_a246@127.0.0.1
```

To let phone-side Pi reach the Windows key router without copying provider keys to
Android, use an ADB reverse mapping:

```powershell
adb reverse tcp:8788 tcp:8788
```

The reverse mapping is transport only. Phone-side Pi still needs an explicit provider
configuration pointing at `http://127.0.0.1:8788/<provider>/v1`; Windows `.pi` config,
extensions, MCP servers, and credentials are intentionally not copied to the phone.

## Operational limits

- This is a standalone Pi runtime, not a clone of the Windows interactive sessions.
- Browser MCP, Windows-only extensions, LSP daemons, and the external-subagent broker
  are not installed on the phone.
- Termux:API is not installed, so clipboard/device integrations are unavailable until
  that separate Android app and package are added.
- Android may suspend long-running background work. For persistent workers, exempt
  Termux from battery optimization and use a Termux foreground-service/job wrapper.
- The phone's npm registry DNS currently fails while the Termux package mirror works.
  The verified `0.84.1` tree was therefore deployed offline from the host package.
  Future upgrades should repeat that controlled bundle transfer or repair phone DNS
  before using `npm install` directly.

## Verification

The installed runtime was verified with:

```bash
pi --version
node --version
pi --help
```

Expected values are Pi `0.84.1` and Node `v26.4.0`.
