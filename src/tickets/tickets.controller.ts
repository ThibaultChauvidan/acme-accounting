import { Body, ConflictException, Controller, Get, Post } from '@nestjs/common';
import { Company } from '../../db/models/Company';
import {
  Ticket,
  TicketCategory,
  TicketStatus,
  TicketType,
} from '../../db/models/Ticket';
import { User, UserRole } from '../../db/models/User';
import { TicketService } from './tickets.service';

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
  constructor(private ticketService: TicketService) {}
  @Get()
  async findAll() {
    return await Ticket.findAll({ include: [Company, User] });
  }

  @Post()
  async create(@Body() newTicketDto: newTicketDto) {
    const { type, companyId } = newTicketDto;

    const category = getCategory(type);
    const userRole = getUserRole(type);

    const {assignee, multiple} = await getAssignee(companyId, userRole);

    const duplicates = await Ticket.findAll({ where: { companyId, type } });

    if (assignee === null)
      throw new ConflictException(
        `Cannot find user with role ${userRole} to create a ticket`,
      );

    if ([UserRole.corporateSecretary, UserRole.director].includes(assignee.role) && multiple)
      throw new ConflictException(
        `Multiple users with role ${assignee.role}. Cannot create a ticket`,
      );

    if (type === TicketType.registrationAddressChange && duplicates.length)
      throw new ConflictException(
        `There already a tickets with type registrationAddressChange. Cannot create a ticket`
      );

    const ticket = await this.ticketService.createTicket({
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

function getCategory(type: TicketType): TicketCategory {
  switch (type) {
    case TicketType.managementReport:
      return TicketCategory.accounting;
    case TicketType.strikeOff:
      return TicketCategory.management;
    default:
      return TicketCategory.corporate;
  }
}

function getUserRole(type: TicketType): UserRole {
  switch (type) {
    case TicketType.managementReport:
      return UserRole.accountant;
    case TicketType.strikeOff:
      return UserRole.director;
    default:
      return UserRole.corporateSecretary;
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
      limit: 2, // For now, no need to query more than 2 to check on duplicates
    });
    if (!users.length) return {assignee:null,multiple:false}
    const assignee = users[0]
    const multiple = users[1]?.role === assignee.role; //check if there is a second valid assignee with the correct role

    return {assignee:users[0],multiple}
}
