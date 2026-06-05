#!/usr/bin/env bash
# Gjallarhorn Community — Installer
# Copyright (c) 2026 Eduardo Emiliano Alaniz - AllSafe Security Solutions
# SPDX-License-Identifier: AGPL-3.0-only
set -euo pipefail

RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; CYAN='\033[0;36m'; NC='\033[0m'
info()    { echo -e "${CYAN}[*]${NC} $1"; }
success() { echo -e "${GREEN}[+]${NC} $1"; }
warn()    { echo -e "${YELLOW}[!]${NC} $1"; }
error()   { echo -e "${RED}[-]${NC} $1"; exit 1; }

echo -e "${CYAN}"
cat << 'LOGO'

                           @@ @@
                        @@@@   @@@@
                    @@@@     @     @@@@
                 @@@@        @        @@@@
             @@@@        @   @   @        @@@@
            @@       @       @    @@@        @@
            @@          @    @   @     @@    @@
            @@    @   @      @   @@      @@  @@      @@@@@@@@@@ @@           @@  @@                 @@
            @@   @       @   @  @@ @@      @ @@      @@         @@  @@@@@@@  @@  @@  @@@@@@   @@@@@ @@@@@@@  @@@@@@@   @@@@ @@@@@@@
            @@      @           @@ @@@@@@@@@ @@      @@  @@@@@@ @@       @@  @@  @@       @@  @     @@    @@ @@    @@ @@    @@    @@
            @@         @       @@@ @ @@@@    @@      @@      @@ @@  @@   @@  @@  @@ @@    @@  @     @@    @@ @@    @@ @@    @@    @@
            @@         @      @@@@@ @@ @  @  @@       @@@@@@@@  @@  @@@@@@@  @@  @@  @@@@@@@  @     @@    @@  @@@@@@  @@    @@    @@
            @@      @        @@@@@@@@@       @@                @@@
            @@       @     @@@@@@@@@@       @@
             @@   @      @@@@@@@@@          @@
             @@@  @@@@@@@@@@@@@        @   @@
              @@@                         @@
                @@        @@@@@@@ @      @@
                 @@@      @@  @@@      @@@
                   @@@    @@@ @@@   @@@@
                      @@@   @@@   @@@
                         @@@@ @@@@
                            @ @

         Blue Team Platform — Community Edition
         https://github.com/allsafe-ar/Gjallarhorn-community
LOGO
echo -e "${NC}"

[ "$EUID" -ne 0 ] && error "Run as root: sudo ./install.sh"
cd "$(dirname "$(realpath "$0")")"

OS=$(. /etc/os-release && echo "$ID")
[[ "$OS" != "ubuntu" && "$OS" != "debian" ]] && error "Supported: Ubuntu 20/22/24, Debian 11/12"

INSTALL_DIR="/opt/gjallarhorn"
DB_NAME="gjallar"
DB_USER="gjallar"
BACKEND_PORT=3003

read -rp "$(echo -e ${CYAN}Domain or IP for nginx [localhost]: ${NC})" DOMAIN
DOMAIN=${DOMAIN:-localhost}
read -rsp "$(echo -e ${CYAN}MySQL root password: ${NC})" MYSQL_ROOT_PASS; echo
read -rsp "$(echo -e ${CYAN}New DB password for user '$DB_USER': ${NC})" DB_PASS; echo

info "Updating package lists..."
apt-get update -qq

if ! command -v node &>/dev/null || [[ $(node -v | cut -d. -f1 | tr -d v) -lt 20 ]]; then
  info "Installing Node.js 20..."
  curl -fsSL https://deb.nodesource.com/setup_20.x | bash - &>/dev/null
  apt-get install -y nodejs &>/dev/null
fi
success "Node.js $(node -v)"

if ! command -v mysql &>/dev/null; then
  info "Installing MySQL/MariaDB..."
  apt-get install -y mysql-server 2>/dev/null || apt-get install -y default-mysql-server &>/dev/null
  systemctl start mysql 2>/dev/null || systemctl start mariadb
fi
success "MySQL ready"

if ! command -v nginx &>/dev/null; then
  info "Installing nginx..."
  apt-get install -y nginx &>/dev/null
fi

if ! command -v pm2 &>/dev/null; then
  info "Installing PM2..."
  npm install -g pm2 &>/dev/null
fi
success "PM2 $(pm2 -v)"

info "Creating database..."
MYSQL_ARGS=(); [ -n "$MYSQL_ROOT_PASS" ] && MYSQL_ARGS=(-p"$MYSQL_ROOT_PASS")
mysql -uroot "${MYSQL_ARGS[@]}" <<SQL 2>/dev/null || warn "DB may already exist"
CREATE DATABASE IF NOT EXISTS ${DB_NAME} CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE USER IF NOT EXISTS '${DB_USER}'@'localhost' IDENTIFIED BY '${DB_PASS}';
GRANT ALL PRIVILEGES ON ${DB_NAME}.* TO '${DB_USER}'@'localhost';
FLUSH PRIVILEGES;
SQL
success "Database '$DB_NAME' ready"

info "Installing to $INSTALL_DIR..."
mkdir -p "$INSTALL_DIR"
rsync -a --exclude='.git' --exclude='node_modules' --exclude='screenshots' --exclude='docs' ./ "$INSTALL_DIR/" 2>/dev/null || cp -r . "$INSTALL_DIR/"
# NOTE: el backend corre bajo PM2 como root. Para producción endurecida, considerá
# ejecutarlo bajo un usuario de servicio (www-data) vía systemd o `pm2 --uid`.
chown -R www-data:www-data "$INSTALL_DIR" 2>/dev/null || true

JWT_SECRET=$(openssl rand -hex 32)
cat > "$INSTALL_DIR/backend/.env" <<ENV
PORT=${BACKEND_PORT}
DB_HOST=localhost
DB_PORT=3306
DB_USER=${DB_USER}
DB_PASSWORD=${DB_PASS}
DB_NAME=${DB_NAME}
JWT_SECRET=${JWT_SECRET}
NODE_ENV=production
CORS_ORIGIN=http://${DOMAIN}
ENV
success ".env generated with random JWT_SECRET"

info "Installing backend dependencies..."
cd "$INSTALL_DIR/backend" && npm install --production --silent
success "Backend ready"

info "Building frontend..."
cd "$INSTALL_DIR/frontend" && npm install --silent && npm run build --silent
success "Frontend built"

info "Configuring nginx..."
cat > /etc/nginx/sites-available/gjallarhorn <<NGINX
server {
    listen 80;
    server_name ${DOMAIN};
    root ${INSTALL_DIR}/frontend/dist;
    index index.html;
    location / { try_files \$uri \$uri/ /index.html; }
    location /api/ {
        proxy_pass http://localhost:${BACKEND_PORT};
        proxy_http_version 1.1;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
    }
    location /uploads/ { alias ${INSTALL_DIR}/backend/uploads/; }
}
NGINX
ln -sf /etc/nginx/sites-available/gjallarhorn /etc/nginx/sites-enabled/
nginx -t && systemctl reload nginx
success "Nginx configured"

if [ "$DOMAIN" != "localhost" ]; then
  info "Requesting TLS certificate (Let's Encrypt)..."
  apt-get install -y certbot python3-certbot-nginx &>/dev/null
  if certbot --nginx -d "$DOMAIN" --non-interactive --agree-tos -m "admin@${DOMAIN}" --redirect &>/dev/null; then
    sed -i "s|^CORS_ORIGIN=.*|CORS_ORIGIN=https://${DOMAIN}|" "$INSTALL_DIR/backend/.env"
    success "TLS enabled (https://${DOMAIN})"
  else
    warn "Could not issue TLS cert (check that DNS points here). Continuing on HTTP."
  fi
fi

info "Starting backend with PM2..."
cd "$INSTALL_DIR/backend"
pm2 start server.js --name gjallarhorn
pm2 save
pm2 startup | tail -1 | bash &>/dev/null || true
success "PM2 process 'gjallarhorn' started"

echo -e "\n${GREEN}╔══════════════════════════════════════════════╗"
echo -e "║   Gjallarhorn Community installed!           ║"
echo -e "╚══════════════════════════════════════════════╝${NC}"
echo -e "  URL:       http://${DOMAIN}"
echo -e "  User:      admin"
echo -e "  Password:  admin123  ${RED}(change immediately!)${NC}"
echo -e "  PM2:       pm2 logs gjallarhorn"
echo -e "  Install:   ${INSTALL_DIR}\n"
