import { Module } from '@nestjs/common';
import { AuthService } from './auth.service';
import { AuthController } from './auth.controller';
import { UsersModule } from '../users/users.module';
import { FirebaseStrategy } from './firebase.strategy';
import { FirebaseAuthGuard } from './firebase-auth.guard';

@Module({
  imports: [
    UsersModule,
    // JwtModule is now registered globally in AppModule
  ],
  controllers: [AuthController],
  providers: [
    AuthService,
    FirebaseStrategy,
    FirebaseAuthGuard,
  ],
  exports: [AuthService, FirebaseAuthGuard],
})
export class AuthModule {}