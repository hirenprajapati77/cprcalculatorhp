#!/bin/bash
set -e

DOMAIN="129-159-230-41.nip.io"
EMAIL="hiren@example.com" # Certbot requires an email

echo "[1/5] Opening local Ubuntu firewalls (iptables & ufw)..."
# Allow in UFW
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
sudo ufw reload || true

# Oracle Cloud strict iptables override
sudo iptables -I INPUT 6 -m state --state NEW -p tcp --dport 80 -j ACCEPT || true
sudo iptables -I INPUT 6 -m state --state NEW -p tcp --dport 443 -j ACCEPT || true
sudo netfilter-persistent save || true

echo "[2/5] Installing Nginx and Certbot..."
sudo apt update
sudo apt install -y nginx certbot python3-certbot-nginx iptables-persistent

echo "[3/5] Configuring Nginx..."
cat <<EOF | sudo tee /etc/nginx/sites-available/cpr-platform
server {
    listen 80;
    server_name $DOMAIN;

    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host \$host;
        proxy_cache_bypass \$http_upgrade;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
    }
}
EOF

sudo ln -sf /etc/nginx/sites-available/cpr-platform /etc/nginx/sites-enabled/
# Remove default site if it exists
sudo rm -f /etc/nginx/sites-enabled/default

sudo systemctl restart nginx

echo "[4/5] Generating Let's Encrypt SSL Certificate..."
# Request the cert and automatically reconfigure the Nginx config
sudo certbot --nginx -d $DOMAIN --non-interactive --agree-tos --register-unsafely-without-email --redirect

echo "[5/5] Restarting Nginx to apply changes..."
sudo systemctl restart nginx

echo "================================================="
echo " HTTPS setup complete!"
echo " Visit: https://$DOMAIN/calculate"
echo "================================================="
