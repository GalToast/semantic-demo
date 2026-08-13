#!/usr/bin/env bash
# bootstrap-phone-surface.sh — give any phone chroot the FULL pi provider surface.
# What the manual fixes did (2026-08-13), now one command:
#   1. copy pi-model-providers extension into the chroot local-packages
#   2. fix package path separator (\\ -> /) in phone settings.json
#   3. patch providerIdForBaseUrl to recognize 8789 (phone router port)
#   4. set OPENCODE_KEY_ROUTER_CATALOG_URL=http://127.0.0.1:8789/catalog
# Usage: bash scripts/bootstrap-phone-surface.sh   (repo root; adb attached)
set -euo pipefail
ADB="${ADB_WIN:-/c/Users/HP/AppData/Local/Microsoft/WinGet/Packages/Google.PlatformTools_Microsoft.Winget.Source_8wekyb3d8bbwe/platform-tools/adb.exe}"
SERIAL="${SERIAL:-77aeb8a8}"
CHROOT=/data/data/com.termux/files/usr/var/lib/proot-distro/containers/ubuntu/rootfs
AGENT="$CHROOT/root/.pi/agent"
PKGDIR="$AGENT/local-packages/pi-model-providers"
LOG=/tmp/bootstrap-phone-surface.log

adb_sh() { "$ADB" -s "$SERIAL" shell "su -c '$1'"; }

echo "== [1/4] install pi-model-providers extension =="
if [ ! -d "$PKGDIR" ]; then
	tar czf /tmp/pmpp.tgz -C "$HOME/.pi/agent/local-packages" pi-model-providers
	"$ADB" -s "$SERIAL" push /tmp/pmpp.tgz /data/local/tmp/ >/dev/null
	adb_sh "mkdir -p '$AGENT/local-packages' && cp /data/local/tmp/pmpp.tgz '$CHROOT/tmp/' && chroot '$CHROOT' /bin/sh -c 'set -e; export PATH=/usr/bin:/bin; cd /root/.pi/agent/local-packages && tar xzf /tmp/pmpp.tgz'"
	rm -f /tmp/pmpp.tgz
else
	echo "  (already present)"
fi

echo "== [2/4] fix settings.json packages path separator =="
adb_sh "chroot '$CHROOT' /usr/bin/python3 -c \"
import json
p='/root/.pi/agent/settings.json'
d=json.load(open(p))
d['packages']=[x.replace('\\\\\\\\','/') if isinstance(x,str) and 'local-packages\\\\\\\\' in x else x for x in d.get('packages',[])]
d['packages']=[x for x in d['packages'] if 'local-packages/pi-model-providers' not in x] + ['local-packages/pi-model-providers']
json.dump(d,open(p,'w'),indent=2)
print('packages ok')
\""

echo "== [3/4] patch providerIdForBaseUrl for port 8789 =="
adb_sh "chroot '$CHROOT' /bin/sh -c 'set -e; export PATH=/usr/bin:/bin; cd /root/.pi/agent/local-packages/pi-model-providers && sed -i \"s/url.port === \\\"8788\\\" || url.port === \\\"8791\\\" || url.port === \\\"8792\\\"/url.port === \\\"8788\\\" || url.port === \\\"8789\\\" || url.port === \\\"8791\\\" || url.port === \\\"8792\\\"/\" index.ts && sed -i \"s%http://127.0.0.1:8788/catalog%http://127.0.0.1:8789/catalog%\" index.ts && echo patched'"

echo "== [4/4] ensure catalog env =="
adb_sh "chroot '$CHROOT' /usr/bin/python3 -c \"
import json
p='/root/.pi/agent/settings.json'
d=json.load(open(p))
d.setdefault('env',{})['OPENCODE_KEY_ROUTER_CATALOG_URL']='http://127.0.0.1:8789/catalog'
json.dump(d,open(p,'w'),indent=2)
print('env ok')
\""

echo "== verify =="
adb_sh "chroot '$CHROOT' /bin/sh -c 'export PATH=/usr/local/bin:/usr/bin:/bin HOME=/root TMPDIR=/tmp; OPENCODE_KEY_ROUTER_CATALOG_URL=http://127.0.0.1:8789/catalog timeout 60 pi --list-models 2>&1 | grep -c router-' | tail -1 | awk '{print \"router-* providers registered:\", \$1}'"
echo "bootstrap complete — restart pi sessions for the new surface"
