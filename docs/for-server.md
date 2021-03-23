# For server

```bash
apt install certbot
certbot certonly --standalone -d example.com -m example@example.com --agree-tos -n
ls /etc/letsencrypt/live/example.com
```

```bash
vi /etc/cron.d/certbot
```

```
00 00 01 * * root certbot renew --pre-hook "" --post-hook ""
```
