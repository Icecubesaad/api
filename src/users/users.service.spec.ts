import { Test, TestingModule } from '@nestjs/testing';
import { UsersService } from './users.service';
import { DatabaseService } from '../database/database.service';

describe('UsersService', () => {
  let service: UsersService;
  let dbService: DatabaseService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        UsersService,
        {
          provide: DatabaseService,
          useValue: {
            user: {
              create: jest.fn(),
              findMany: jest.fn(),
              findUnique: jest.fn(),
              update: jest.fn(),
              delete: jest.fn(),
            },
          },
        },
      ],
    }).compile();

    service = module.get<UsersService>(UsersService);
    dbService = module.get<DatabaseService>(DatabaseService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('should create a user', async () => {
    const createUserDto = {
      email: 'test@example.com',
      displayName: 'Test User',
      firebaseUid: 'test-uid',
    };

    const expectedUser = {
      id: '1',
      ...createUserDto,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    jest.spyOn(dbService.user, 'create').mockResolvedValue(expectedUser as any);

    const result = await service.create(createUserDto);
    expect(result).toEqual(expectedUser);
    expect(dbService.user.create).toHaveBeenCalledWith({ data: createUserDto });
  });
});
