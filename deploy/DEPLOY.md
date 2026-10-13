# Deploying lp.knoalabs.com on DigitalOcean (nginx)

Static site: plain HTML/CSS/JS. **No build step, no Node, no database.** nginx serves the repo folder as-is.

## 1. Server (one time)

```bash
sudo apt update && sudo apt install -y nginx certbot python3-certbot-nginx git
sudo git clone https://github.com/infocreon/Knoalabsmarketingsite.git /var/www/lp.knoalabs.com
sudo cp /var/www/lp.knoalabs.com/deploy/nginx-lp.knoalabs.com.conf /etc/nginx/sites-available/lp.knoalabs.com
sudo ln -s /etc/nginx/sites-available/lp.knoalabs.com /etc/nginx/sites-enabled/
sudo nginx -t && sudo systemctl reload nginx
```

If you clone to a different folder, change the `root` and the `include` paths in the config.

## 2. Test BEFORE changing DNS

Point your own computer at the droplet (hosts file: `<droplet-ip> lp.knoalabs.com`) or use curl:

```bash
curl -sI -H "Host: lp.knoalabs.com" http://<droplet-ip>/cyber-security                 # 200
curl -sI -H "Host: lp.knoalabs.com" http://<droplet-ip>/cyber-security/thank-you       # 200 + X-Robots-Tag: noindex
curl -sI -H "Host: lp.knoalabs.com" http://<droplet-ip>/cyber-security.html            # 301 -> /cyber-security
curl -sI -H "Host: lp.knoalabs.com" "http://<droplet-ip>/Generativeai&Agenticai/online-course"   # 200
curl -sI -H "Host: lp.knoalabs.com" http://<droplet-ip>/privacy                        # 302 -> knoalabs.com/privacy-policy/
curl -sI -H "Host: lp.knoalabs.com" http://<droplet-ip>/README.md                      # 404 (internal files hidden)
```

## 3. Switch DNS (GoDaddy)

Replace the `lp` record: delete `CNAME lp -> cname.vercel-dns.com`, add `A lp -> <droplet-ip>` (TTL 600).
Keep every other record. Wait until `nslookup lp.knoalabs.com 8.8.8.8` shows the droplet IP.

## 4. HTTPS

```bash
sudo certbot --nginx -d lp.knoalabs.com --redirect
```

Certbot renews automatically. Check: `https://lp.knoalabs.com/cyber-security` loads with a padlock.
Tell Abdul Shaheed when this is live. The Vercel copy stays running until the switch is confirmed, so ads never hit a broken page.

## 5. Updating the site later

```bash
cd /var/www/lp.knoalabs.com && sudo git pull
```

No restart is needed. Files in `/shared/` and `/*/assets/` are cached for 1 year, so changed CSS/JS always gets a new `?v=` number in the HTML and changed assets get a new file name.

## Do not change

- URLs `/cyber-security`, `/cyber-security/thank-you`, `/Generativeai&Agenticai/online-course`, `/generative-ai/thank-you`. Google Ads and GTM depend on them.
- `/google9ecbfd1f9448cc0b.html` (Google Search Console verification).

## Also needed: remove the 9 old NS records

Hosting on DigitalOcean does not fix the "site not opening on some networks" problem. The knoalabs.com
DNS in GoDaddy still lists 9 old nameservers (3 DigitalOcean, 6 dns-parking.com) that answer "lp.knoalabs.com
does not exist". Delete those 9 NS records (keep ns35/ns36.domaincontrol.com). Steps: Knoalabs-DNS-Fix-for-Developer-v2.pdf.
