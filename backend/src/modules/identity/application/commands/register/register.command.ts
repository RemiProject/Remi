import { Command } from '@nestjs/cqrs';

export class RegisterCommand extends Command<{ userId: string }> {
  constructor(
    public readonly email: string,
    public readonly password: string,
    public readonly name: string,
    public readonly countryCode: string,
    public readonly localeCode: string,
    public readonly timezone: string,
    public readonly languageCode?: string,
  ) {
    super();
  }
}
