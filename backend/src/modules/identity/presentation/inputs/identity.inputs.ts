import { Field, InputType } from '@nestjs/graphql';
import { IsEmail, IsIn, IsNotEmpty, IsOptional, IsString, IsUUID, Length, MaxLength, MinLength } from 'class-validator';
import { HouseholdRoleGql } from '@/modules/identity/presentation/types/identity.types.js';

@InputType()
export class RegisterInput {
  @Field() @IsEmail() @MaxLength(254) email!: string;
  @Field() @IsString() @MinLength(8) @MaxLength(128) password!: string;
  @Field() @IsString() @IsNotEmpty() @MaxLength(100) name!: string;
  @Field({ description: 'ISO 3166 alpha-2, e.g. EG' }) @IsString() @Length(2, 2) countryCode!: string;
  @Field({ description: 'e.g. ar-EG' }) @IsString() @MaxLength(10) localeCode!: string;
  @Field({ description: 'IANA zone, e.g. Africa/Cairo' }) @IsString() @MaxLength(64) timezone!: string;
  @Field({ nullable: true, description: 'ar | en. Defaults to the locale language' }) @IsOptional() @IsIn(['ar', 'en']) languageCode?: string;
}

@InputType()
export class LoginInput {
  @Field() @IsEmail() email!: string;
  @Field() @IsString() @IsNotEmpty() @MaxLength(128) password!: string;
}

@InputType()
export class TokenInput {
  @Field() @IsString() @IsNotEmpty() @MaxLength(256) token!: string;
}

@InputType()
export class RefreshAccessTokenInput {
  @Field() @IsString() @IsNotEmpty() @MaxLength(256) refreshToken!: string;
}

@InputType()
export class LogoutInput {
  @Field() @IsString() @IsNotEmpty() @MaxLength(256) refreshToken!: string;
}

@InputType()
export class RequestPasswordResetInput {
  @Field() @IsEmail() email!: string;
}

@InputType()
export class ResetPasswordInput {
  @Field() @IsString() @IsNotEmpty() @MaxLength(256) token!: string;
  @Field() @IsString() @MinLength(8) @MaxLength(128) newPassword!: string;
}

@InputType()
export class CreateHouseholdInput {
  @Field() @IsString() @IsNotEmpty() @MaxLength(100) name!: string;
  @Field({ nullable: true }) @IsOptional() @IsString() @MaxLength(64) timezone?: string;
}

@InputType()
export class InviteMemberInput {
  @Field() @IsEmail() email!: string;
  @Field(() => HouseholdRoleGql, { defaultValue: HouseholdRoleGql.MEMBER }) @IsIn(['MEMBER']) role: HouseholdRoleGql = HouseholdRoleGql.MEMBER;
}

@InputType()
export class RevokeInvitationInput {
  @Field() @IsUUID() invitationId!: string;
}

@InputType()
export class RemoveMemberInput {
  @Field() @IsUUID() userId!: string;
}
