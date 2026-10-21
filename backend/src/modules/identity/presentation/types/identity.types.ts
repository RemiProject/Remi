import { Field, ID, Int, ObjectType, registerEnumType } from '@nestjs/graphql';

export enum HouseholdRoleGql { OWNER = 'OWNER', MEMBER = 'MEMBER' }
registerEnumType(HouseholdRoleGql, { name: 'HouseholdRole' });

@ObjectType('AuthTokens')
export class AuthTokensType {
  @Field() accessToken!: string;
  @Field() refreshToken!: string;
  @Field(() => Int) expiresInSeconds!: number;
}

@ObjectType('RegisterResult')
export class RegisterResultType { @Field(() => ID) userId!: string }

@ObjectType('Me')
export class MeType {
  @Field(() => ID) id!: string;
  @Field() email!: string;
  @Field() name!: string;
  @Field() timezone!: string;
  @Field() languageCode!: string;
  @Field(() => Date, { nullable: true }) emailVerifiedAt?: Date | null;
}

@ObjectType('Household')
export class HouseholdType {
  @Field(() => ID) id!: string;
  @Field() name!: string;
  @Field() timezone!: string;
}

@ObjectType('MyHousehold')
export class MyHouseholdType {
  @Field(() => HouseholdType) household!: HouseholdType;
  @Field(() => HouseholdRoleGql) role!: HouseholdRoleGql;
  @Field(() => Date) joinedAt!: Date;
}

@ObjectType('HouseholdMember')
export class HouseholdMemberType {
  @Field(() => ID) userId!: string;
  @Field() name!: string;
  @Field() email!: string;
  @Field(() => HouseholdRoleGql) role!: HouseholdRoleGql;
  @Field(() => Date) joinedAt!: Date;
}

@ObjectType('Invitation')
export class InvitationType {
  @Field(() => ID) id!: string;
  @Field() email!: string;
  @Field(() => HouseholdRoleGql) role!: HouseholdRoleGql;
  @Field(() => Date) createdAt!: Date;
}
