# DNS Setup for bonimbait.com

## Overview

bonimbait.com is registered on GoDaddy (nameservers `ns47` / `ns48.domaincontrol.com`) and served by the
Render web service `bonimbait-web` (project Bonimbait). Until 2026-11-08 it was served by Vercel.

## DNS Records (GoDaddy)

| Type  | Name | Value                         | TTL         |
|-------|------|-------------------------------|-------------|
| A     | @    | `216.24.57.1`                 | 600 seconds |
| CNAME | www  | `bonimbait-web.onrender.com`  | 1 hour      |

`216.24.57.1` is Render's address for apex domains (a CNAME isn't allowed on `@`). Don't add AAAA records:
Render doesn't serve the apex over IPv6. Leave the NS, SOA, `_domainconnect` and `_dmarc` records alone.

## On Render

The service has both custom domains: `bonimbait.com`, and `www.bonimbait.com`, which redirects (301) to
`bonimbait.com` with its path. After a DNS change, Render verifies the domains and issues the
certificates itself (Google Trust Services, renewed automatically). The first certificate took about
5 minutes after the records propagated.

## Verify

```bash
# Records, at GoDaddy and at a public resolver
dig +short @ns47.domaincontrol.com bonimbait.com A
dig +short @8.8.8.8 www.bonimbait.com CNAME

# Certificate
echo | openssl s_client -connect bonimbait.com:443 -servername bonimbait.com 2>/dev/null | openssl x509 -noout -subject -issuer -enddate

# The site, and the www redirect (301 to https://bonimbait.com/...)
curl -sI https://bonimbait.com/ | head -1
curl -sI https://www.bonimbait.com/ask/ | grep -iE '^(HTTP|location)'
```

## Troubleshooting

- **TLS handshake failure on a new domain**: the certificate isn't issued yet. Check that the records
  above are published (`dig` at `ns47.domaincontrol.com`), then wait a few minutes.
- **www still shows the old host**: the old CNAME is cached for its TTL (1 hour). Check GoDaddy's own
  nameserver first; if that's right, it's just the cache.
- **Propagation**: https://dnschecker.org shows global status.
