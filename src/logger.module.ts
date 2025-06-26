import { Module } from '@nestjs/common';
import { WinstonModule, WinstonModuleOptions } from 'nest-winston';
import * as winston from 'winston';

const format = winston.format.combine(
    winston.format.timestamp(),
    winston.format.printf(({ timestamp, level, message }) => {
        return `[${timestamp}] ${level.toUpperCase()}: ${message}`;
    })
);

const winstonConfig: WinstonModuleOptions = {
  transports: [
    new winston.transports.File({
      filename: 'logs/report.log',
      level: 'debug',
      format,
    }),
    new winston.transports.Console({
      format,
    }),
  ],
};

@Module({
  imports: [
    WinstonModule.forRoot(winstonConfig),
  ],
})
export class LoggerModule {}