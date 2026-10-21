import { Field, ID, ObjectType, registerEnumType } from '@nestjs/graphql';
import { DecimalScalar } from '@/platform/graphql/scalars.js';

export enum RecommendationTypeEnum { SUPPLY_NEED = 'SUPPLY_NEED' }
registerEnumType(RecommendationTypeEnum, { name: 'RecommendationType' });

@ObjectType()
export class SupplyRecommendationType {
  @Field(() => ID) id!: string;
  @Field(() => String, { nullable: true }) summary!: string | null;
  @Field(() => Date) generatedAt!: Date;
  @Field(() => Date) expiresAt!: Date;
  @Field(() => ID) foodId!: string;
  @Field() foodName!: string;
  @Field(() => DecimalScalar) suggestedQty!: string;
  @Field() unit!: string;
  @Field() priority!: string;
}

@ObjectType()
export class RecommendationPageInfoType {
  @Field() hasNextPage!: boolean;
  @Field(() => String, { nullable: true }) endCursor!: string | null;
}

@ObjectType()
export class RecommendationConnectionType {
  @Field(() => [SupplyRecommendationType]) nodes!: SupplyRecommendationType[];
  @Field(() => RecommendationPageInfoType) pageInfo!: RecommendationPageInfoType;
}
