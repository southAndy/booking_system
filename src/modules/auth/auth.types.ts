import { User } from '../users/entities/user.entity';

export type CurrentAuthUser = User & { sessionId?: string };
