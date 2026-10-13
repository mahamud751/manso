import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Injectable,
  CanActivate,
  ExecutionContext,
  UnauthorizedException,
  ForbiddenException,
  SetMetadata,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import { User, UserRole } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

export function fail(status: number, message: string, code: string): HttpException {
  return new HttpException({ message, code }, status);
}

@Catch()
export class ApiExceptionFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost) {
    const response = host.switchToHttp().getResponse();
    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      const body = exception.getResponse();
      const rawMessage =
        typeof body === 'string'
          ? body
          : (body as { message?: string | string[] }).message ?? 'Request failed';
      const message = Array.isArray(rawMessage) ? rawMessage.join(', ') : rawMessage;
      const code =
        typeof body === 'object' && body && 'code' in body
          ? String((body as { code: string }).code)
          : status === 400
            ? 'VALIDATION'
            : 'REQUEST_FAILED';
      response.status(status).json({
        statusCode: status,
        message,
        code,
        errors: Array.isArray(rawMessage) ? rawMessage : undefined,
      });
      return;
    }
    // eslint-disable-next-line no-console
    console.error(exception);
    response.status(HttpStatus.INTERNAL_SERVER_ERROR).json({
      statusCode: 500,
      message: 'Something went wrong.',
      code: 'INTERNAL',
    });
  }
}

export type RequestUser = User;

@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly jwt: JwtService,
    private readonly prisma: PrismaService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest();
    const header = req.headers.authorization as string | undefined;
    if (!header?.startsWith('Bearer ')) {
      throw new UnauthorizedException({ message: 'Sign in required.', code: 'UNAUTHENTICATED' });
    }
    try {
      const payload = await this.jwt.verifyAsync<{ sub: string }>(header.slice(7));
      const user = await this.prisma.user.findUnique({ where: { id: payload.sub } });
      if (!user || user.deletedAt) throw new Error('missing');
      req.user = user;
      return true;
    } catch (error) {
      if (error instanceof UnauthorizedException) throw error;
      throw new UnauthorizedException({
        message: 'Session expired. Sign in again.',
        code: 'SESSION_EXPIRED',
      });
    }
  }
}

export const Roles = (...roles: UserRole[]) => SetMetadata('roles', roles);

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const roles = this.reflector.getAllAndOverride<UserRole[]>('roles', [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!roles?.length) return true;
    const user = context.switchToHttp().getRequest().user as User | undefined;
    if (!user || !roles.includes(user.role)) {
      throw new ForbiddenException({ message: 'You do not have access to this.', code: 'FORBIDDEN' });
    }
    return true;
  }
}

export function assertBranchAccess(user: User, branchId: string) {
  if (user.role === UserRole.OWNER || user.role === UserRole.FINANCE || user.role === UserRole.SUPPORT) {
    return;
  }
  if (user.staffBranchId !== branchId) {
    throw new ForbiddenException({
      message: 'This belongs to another branch.',
      code: 'BRANCH_FORBIDDEN',
    });
  }
}
