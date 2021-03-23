import winston from 'winston';

export const logger = winston.createLogger({
  level: 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.cli(),
    winston.format.printf((info) => `[${info.timestamp}] ${info.level} ${info.message}`),
  ),
  defaultMeta: { service: 'user-service' },
  transports: [new winston.transports.Console()],
});
