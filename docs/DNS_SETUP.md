# DNS Setup for bonimbait.com

## Overview

bonimbait.com is registered on GoDaddy and deployed to Vercel. The DNS records below point the domain to Vercel's edge network.

## Required DNS Records (GoDaddy)

| Type  | Name | Value                    | TTL  |
|-------|------|--------------------------|------|
| CNAME | @    | cname.vercel-dns.com     | 600  |
| CNAME | www  | cname.vercel-dns.com     | 600  |

> **Note**: GoDaddy may require an A record for the apex domain (`@`) instead of a CNAME. In that case, use Vercel's A record IP: `76.76.21.21`.

| Type | Name | Value        | TTL  |
|------|------|--------------|------|
| A    | @    | 76.76.21.21  | 600  |

## Setup Steps

1. Log into GoDaddy DNS management for bonimbait.com
2. Delete any existing A or CNAME records for `@` and `www`
3. Add the records listed above
4. In Vercel dashboard: **Settings > Domains > Add Domain** and enter `bonimbait.com`
5. Also add `www.bonimbait.com` and set it to redirect to `bonimbait.com`
6. Wait for DNS propagation (usually 5-30 minutes, up to 48 hours)

## SSL Verification

Vercel automatically provisions and renews SSL certificates via Let's Encrypt.

To verify SSL is working:

```bash
# Check certificate
curl -vI https://bonimbait.com 2>&1 | grep -E "SSL|subject|issuer|expire"

# Verify redirect from www
curl -I https://www.bonimbait.com
# Should return 308 redirect to https://bonimbait.com
```

## Troubleshooting

- **SSL not provisioning**: Ensure DNS records are correct and propagated. Check Vercel domain settings for errors.
- **DNS not resolving**: Use `dig bonimbait.com` or `nslookup bonimbait.com` to verify records.
- **Propagation delays**: Use https://dnschecker.org to check global propagation status.
