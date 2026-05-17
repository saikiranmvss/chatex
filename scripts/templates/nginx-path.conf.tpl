# ${APP_NAME} — path locations (included from cloudteor-http server block)

location ${BASE_PATH}api/ {
    proxy_pass http://127.0.0.1:${APP_PORT}/api/;
    proxy_http_version 1.1;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
    proxy_connect_timeout 60s;
    proxy_send_timeout 120s;
    proxy_read_timeout 120s;
    proxy_buffering off;
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection $connection_upgrade;
}

location ${BASE_PATH} {
    alias ${APP_HOME}/current/web/;
    index index.html;
    try_files $uri $uri/ ${BASE_PATH}index.html;
}
