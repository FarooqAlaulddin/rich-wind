# Deploy templates

Placeholders only. Replace `example.com`, paths and the service user for your host.

## Files

- `release.sh` - installs an `npm pack` tarball as a new release, switches, health-checks, rolls back on failure.
- `rich-wind.service` - systemd unit (runs `node ./services/index.js`, the same entry as `npm start`).
- `nginx.conf.template` and `rich-wind-proxy.inc` - reverse proxy with `limit_req` zones keyed on the real client address.
- `rich-wind.env.example` - every environment variable the server reads.

## Install

1. Create a system user `rich-wind` and directories `/opt/rich-wind/releases` and `/etc/rich-wind`.
2. Copy `rich-wind.env.example` to `/etc/rich-wind/rich-wind.env` and edit it.
3. Copy `rich-wind.service` to `/etc/systemd/system/`, then `systemctl daemon-reload && systemctl enable rich-wind`.
4. Install the nginx files (see the comments in them), set `server_name`, then `nginx -t` and reload.
5. Build a tarball with `npm pack`, copy it to the host, and run `deploy/release.sh <tarball>`.

Settings: `RW_APP_DIR`, `RW_SERVICE`, `RW_HEALTH_URL` (default `http://127.0.0.1:3001/health`), `KEEP_RELEASES` (default 5), `RW_SUDO`.

## Rollback

Each release lives in `releases/<timestamp>`; `current` is a symlink. The script records the old target, switches the link atomically, restarts, and polls `/health` for 30 seconds. If it never answers, the link goes back to the old release, the service restarts, and the script exits non-zero. The failed release stays on disk for inspection. Old releases are pruned only after a healthy start, and the current and previous releases are never pruned.

## Owner checks (issue 36)

- Find out why the VM host key changed (rebuilt instance, or the address now serves another machine) before accepting a new key.
- Restore the tunnel and confirm the public `/health` answers.
- The VM startup script must start the server with `npm start` or `node ./services/index.js`, not through `core.app`.
- Set `RW_TRUST_PROXY` to the real hop count and confirm the nginx zones see the real client address (send requests from two clients; each gets its own bucket).
