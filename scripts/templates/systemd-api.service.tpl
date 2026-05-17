[Unit]
Description=${APP_NAME} API (Node.js)
After=network.target mysql.service postgresql.service
Wants=network-online.target

[Service]
Type=simple
User=${DEPLOY_USER}
Group=www-data
WorkingDirectory=${APP_HOME}/current
EnvironmentFile=${APP_HOME}/shared/.env
Environment=NODE_ENV=production
Environment=PORT=${APP_PORT}
ExecStart=/bin/bash -lc 'source /home/${DEPLOY_USER}/.nvm/nvm.sh && nvm use ${NODE_VERSION} && exec ${API_START_CMD}'
Restart=on-failure
RestartSec=5
StandardOutput=append:${APP_HOME}/shared/logs/api.log
StandardError=append:${APP_HOME}/shared/logs/api-error.log
LimitNOFILE=65535

[Install]
WantedBy=multi-user.target
