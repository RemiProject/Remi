import { Field, InputType } from '@nestjs/graphql';
import { IsEmail, IsIn, IsNotEmpty, IsOptional, IsString, IsUUID, Length, MaxLength, MinLength, Matches } from 'class-validator';
import { HouseholdRoleGql } from '@/modules/identity/presentation/types/identity.types.js';

@InputType()
export class RegisterInput {
  @Field() @IsString() @Length(3, 30) @Matches(/^[a-zA-Z][a-zA-Z0-9_]{2,29}$/) username!: string;
  @Field() @IsString() @Matches(/^\+(?:201[0125][0-9]{8}|9665[0-9]{8})$/) phoneNumber!: string;
  @Field() @IsEmail() @MaxLength(254) email!: string;
  @Field() @IsString() @MinLength(8) @MaxLength(128) @Matches(/^(?=.*[A-Z])(?=.*[0-9])(?=.*[\p{P}\p{S}])[\s\S]+$/u) password!: string;
  @Field() @IsString() @IsNotEmpty() @MaxLength(100) @Matches(/\S/) name!: string;
  @Field({ nullable: true }) @IsOptional() @IsString() @Length(2, 2) countryCode?: string;
  @Field({ nullable: true }) @IsOptional() @IsString() @MaxLength(10) localeCode?: string;
  @Field({ nullable: true }) @IsOptional() @IsString() @MaxLength(64) timezone?: string;
  @Field({ nullable: true, description: 'ar | en. Defaults to the locale language' }) @IsOptional() @IsIn(['ar', 'en']) languageCode?: string;
}

@InputType()
export class LoginInput {
  @Field({ nullable: true, description: 'Email or username' }) @IsOptional() @IsString() @IsNotEmpty() @MaxLength(254) identifier?: string;
  @Field({ nullable: true, deprecationReason: 'Use identifier for email or username login.' }) @IsOptional() @IsEmail() email?: string;
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
  @Field() @IsString() @MinLength(8) @MaxLength(128) @Matches(/^(?=.*[A-Z])(?=.*[0-9])(?=.*[\p{P}\p{S}])[\s\S]+$/u) newPassword!: string;
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

@InputType()
export class TransferOwnershipInput {
  @Field() @IsUUID() newOwnerUserId!: string;
}
