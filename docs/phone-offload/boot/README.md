# Reboot-restore scripts (verified 2026-08-13 by kill-and-restore simulation)

The McLaren phone auto-restores the farm on boot automatically:
`~/.termux/boot/boot-farm` + `~/.termux/boot/boot-router` (Termux:Boot runs
them as u0_a246; both elevate via magisk su).

Verified restore (each service killed, then the boot scripts rerun, all return):
- sshd :8022  (key-auth; laptop ssh works)
- key-router :8789 (cold start via chroot /etc/rc.local -> /opt/router/start.sh;
  takes ~10s on cold start — boot-router's 5s poll may print 0 but it IS up after)
- git-daemon :9418 (LAN clones)
- bind-mount $TERMUX_HOME/repos -> chroot /mnt/phonerepos
- battery Doze exemption: com.termux whitelisted + RUN_IN_BACKGROUND allow

## Critical pitfall (fixed v3)
`$HOME` is EMPTY inside `su -c` on Termux — never use `$HOME` for the bind
source inside the mount command; hardcode /data/data/com.termux/files/home.
v1/v2 silently bound the wrong dir (the phone home, not ~/repos) and claimed
success. This file (boot-farm) is the v3 that hardcodes it.
