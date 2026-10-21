import { Module } from '@nestjs/common';
import { SafetyModule } from '@/modules/safety/safety.module.js';
import { NotesCipher } from '@/modules/safety/infrastructure/notes-cipher.js';
import { AppConfigService } from '@/platform/config/app-config.service.js';
import { ProfileService } from './application/profile.service.js';
import { ProfileResolver } from './presentation/profile.resolver.js';

@Module({ imports: [SafetyModule], providers: [ProfileService, ProfileResolver, {
  provide: NotesCipher,
  inject: [AppConfigService],
  useFactory: (config: AppConfigService) => new NotesCipher(config.env.PROFILE_NOTES_KEYRING),
}], exports: [ProfileService] })
export class ProfileModule {}
