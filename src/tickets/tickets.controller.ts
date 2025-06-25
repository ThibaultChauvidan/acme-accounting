import { Body, ConflictException, Controller, Get, Post } from '@nestjs/common';
import { Company } from '../../db/models/Company';
import {
  Ticket,
  TicketCategory,
  TicketStatus,
  TicketType,
} from '../../db/models/Ticket';
import { User, UserRole } from '../../db/models/User';

interface newTicketDto {
  type: TicketType;
  companyId: number;
}

interface TicketDto {
  id: number;
  type: TicketType;
  companyId: number;
  assigneeId: number;
  status: TicketStatus;
  category: TicketCategory;
}

@Controller('api/v1/tickets')
export class TicketsController {
  @Get()
  async findAll() {
    return await Ticket.findAll({ include: [Company, User] });
  }

  @Post()
  async create(@Body() newTicketDto: newTicketDto) {
    const { type, companyId } = newTicketDto;

    const category =
      type === TicketType.managementReport
        ? TicketCategory.accounting
        : TicketCategory.corporate;

    const userRole =
      type === TicketType.managementReport
        ? UserRole.accountant
        : UserRole.corporateSecretary;

    const {assignee, multiple} = await getAssignee(companyId, userRole);

    const duplicates = await Ticket.findAll({ where: { companyId, type } });

    if (assignee === null)
      throw new ConflictException(
        `Cannot find user with role ${userRole} to create a ticket`,
      );

    if (userRole === UserRole.corporateSecretary && multiple)
      throw new ConflictException(
        `Multiple users with role ${assignee.role}. Cannot create a ticket`,
      );

    if (type === TicketType.registrationAddressChange && duplicates.length)
      throw new ConflictException(
        `There already a tickets with type registrationAddressChange. Cannot create a ticket`
      );

    const ticket = await Ticket.create({
      companyId,
      assigneeId: assignee.id,
      category,
      type,
      status: TicketStatus.open,
    });

    const ticketDto: TicketDto = {
      id: ticket.id,
      type: ticket.type,
      assigneeId: ticket.assigneeId,
      status: ticket.status,
      category: ticket.category,
      companyId: ticket.companyId,
    };

    return ticketDto;
  }
}

async function getAssignee(companyId: number, userRole: UserRole): Promise<{assignee:User|null,multiple:boolean}> {
  const roleCondition = userRole === UserRole.corporateSecretary ? [userRole, UserRole.director] : userRole;
  const users = await User.findAll({
      where: { companyId, role: roleCondition },
      order: [
        ['role', 'ASC'],        // Alphabetical: 'corporateSecretary' < 'director'
        ['createdAt', 'DESC']
      ],
      limit:2, // No need to query more than 2 to check on duplicates
    });
    if (!users.length) return {assignee:null,multiple:false}
    
    let multiple = users.length > 1;
    if (userRole === UserRole.corporateSecretary) {
      multiple = users.filter(u => u.role === UserRole.corporateSecretary).length > 1 || users.filter(u => u.role === UserRole.director).length > 1;
    }

    return {assignee:users[0],multiple: users.length > 1}
}
