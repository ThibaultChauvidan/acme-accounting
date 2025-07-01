import { Controller, Get, Post, HttpCode } from '@nestjs/common';
import { ReportsService } from './reports.service';

@Controller('api/v1/reports')
export class ReportsController {
  constructor(private reportsService: ReportsService) {}

  @Get()
  report() {
    return {
      'accounts.csv': this.reportsService.state('accounts'),
      'yearly.csv': this.reportsService.state('yearly'),
      'fs.csv': this.reportsService.state('fs'),
    };
  }

  @Post()
  @HttpCode(201)
  async generate() {
    this.reportsService.generateAsyncReport('accounts');
    this.reportsService.generateAsyncReport('yearly');
    this.reportsService.generateAsyncReport('fs');
    return { message: 'started' };
  }
}
