import { Test, TestingModule } from '@nestjs/testing';
import { TicketService } from './tickets.service';
import { DbModule } from '../db.module';

describe('TicketService', () => {
  let service: TicketService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [TicketService],
      imports: [DbModule],
    }).compile();

    service = module.get<TicketService>(TicketService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
