import { Injectable } from '@nestjs/common';
import { Sequelize } from 'sequelize-typescript';
import { Ticket, TicketCategory, TicketStatus, TicketType } from '../../db/models/Ticket';

type TicketData = {
    companyId: number;
    assigneeId: number;
    category: TicketCategory;
    type: TicketType;
    status: TicketStatus;
}

@Injectable()
export class TicketService {
  constructor(
    private readonly sequelize: Sequelize,
) {}

  async createTicket(ticketData: TicketData): Promise<Ticket> {
    return await this.sequelize.transaction(async (transaction) => {
        const newTicket = await Ticket.create(
            { ...ticketData },
            { transaction }
        );

        if (ticketData.type ===TicketType.strikeOff) 
            await Ticket.update({status: TicketStatus.resolved}, {where:{companyId:ticketData.companyId}, transaction});

        return newTicket;
    });
  }
}
