import { Field, ID, InputType, Int, ObjectType, registerEnumType } from '@nestjs/graphql';
import { ArrayMaxSize, IsArray, IsDateString, IsEnum, IsInt, IsOptional, IsString, IsUUID, Matches, Max, MaxLength, Min, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';
import { DecimalScalar } from '@/platform/graphql/scalars.js';

export enum GenderType { MALE = 'MALE', FEMALE = 'FEMALE', OTHER = 'OTHER', PREFER_NOT_TO_SAY = 'PREFER_NOT_TO_SAY' }
export enum ActivityLevelType { SEDENTARY = 'SEDENTARY', LIGHT = 'LIGHT', MODERATE = 'MODERATE', ACTIVE = 'ACTIVE', VERY_ACTIVE = 'VERY_ACTIVE' }
export enum GoalTypeEnum { LOSE_WEIGHT = 'LOSE_WEIGHT', GAIN_MUSCLE = 'GAIN_MUSCLE', MAINTAIN = 'MAINTAIN', CUSTOM = 'CUSTOM' }
export enum DietaryPreferenceType { VEGETARIAN = 'VEGETARIAN', VEGAN = 'VEGAN', HALAL = 'HALAL', GLUTEN_FREE = 'GLUTEN_FREE', DAIRY_FREE = 'DAIRY_FREE', KETO = 'KETO', LOW_CARB = 'LOW_CARB' }
export enum AllergySeverityType { MILD = 'MILD', MODERATE = 'MODERATE', SEVERE = 'SEVERE', LIFE_THREATENING = 'LIFE_THREATENING' }
export enum ConditionStatusType { ACTIVE = 'ACTIVE', CONTROLLED = 'CONTROLLED', REMISSION = 'REMISSION', RESOLVED = 'RESOLVED' }
export enum SafetyEntityTypeEnum { ALLERGY_FOOD = 'ALLERGY_FOOD', ALLERGY_CATEGORY = 'ALLERGY_CATEGORY', HEALTH_CONDITION = 'HEALTH_CONDITION', DIETARY_PREFERENCE = 'DIETARY_PREFERENCE', DISLIKE_FOOD = 'DISLIKE_FOOD', DISLIKE_CATEGORY = 'DISLIKE_CATEGORY' }
export enum SafetyEventActionEnum { CREATED = 'CREATED', UPDATED = 'UPDATED', DELETED = 'DELETED' }
export enum HealthConditionGroupType { METABOLIC = 'METABOLIC', CARDIOVASCULAR = 'CARDIOVASCULAR', RENAL = 'RENAL', DIGESTIVE = 'DIGESTIVE', AUTOIMMUNE = 'AUTOIMMUNE', OTHER = 'OTHER' }
for (const [enumObject, name] of [
  [GenderType, 'Gender'], [ActivityLevelType, 'ActivityLevel'], [GoalTypeEnum, 'GoalType'],
  [DietaryPreferenceType, 'DietaryPreference'], [AllergySeverityType, 'AllergySeverity'],
  [ConditionStatusType, 'ConditionStatus'], [SafetyEntityTypeEnum, 'SafetyEntityType'], [SafetyEventActionEnum, 'SafetyEventAction'],
  [HealthConditionGroupType, 'HealthConditionGroup'],
] as const) registerEnumType(enumObject, { name });

@InputType()
export class UpdateProfileInputType {
  @Field(() => DecimalScalar, { nullable: true }) @IsOptional() @IsString() @Matches(/^\d+(?:\.\d{1,1})?$/) heightCm?: string;
  @Field(() => DecimalScalar, { nullable: true }) @IsOptional() @IsString() @Matches(/^\d+(?:\.\d{1,2})?$/) weightKg?: string;
  @Field(() => String, { nullable: true }) @IsOptional() @IsDateString() birthDate?: string;
  @Field(() => GenderType, { nullable: true }) @IsOptional() @IsEnum(GenderType) gender?: GenderType;
  @Field(() => ActivityLevelType, { nullable: true }) @IsOptional() @IsEnum(ActivityLevelType) activityLevel?: ActivityLevelType;
}

@InputType()
export class SetGoalInputType {
  @Field(() => GoalTypeEnum) @IsEnum(GoalTypeEnum) goalType!: GoalTypeEnum;
  @Field(() => DecimalScalar, { nullable: true }) @IsOptional() @IsString() @Matches(/^\d+(?:\.\d{1,2})?$/) targetWeightKg?: string;
  @Field(() => Int, { nullable: true }) @IsOptional() @IsInt() @Min(500) @Max(20000) calorieTarget?: number;
  @Field(() => Int, { nullable: true }) @IsOptional() @IsInt() @Min(1) @Max(1000) proteinTargetG?: number;
}

@InputType()
export class AllergyInputType {
  @Field(() => ID, { nullable: true }) @IsOptional() @IsUUID() foodId?: string;
  @Field(() => ID, { nullable: true }) @IsOptional() @IsUUID() categoryId?: string;
  @Field(() => AllergySeverityType) @IsEnum(AllergySeverityType) severity!: AllergySeverityType;
  @Field(() => String, { nullable: true }) @IsOptional() @IsString() @MaxLength(2000) notes?: string;
}

@InputType()
export class RemoveAllergyInputType {
  @Field(() => ID, { nullable: true }) @IsOptional() @IsUUID() foodId?: string;
  @Field(() => ID, { nullable: true }) @IsOptional() @IsUUID() categoryId?: string;
}

@InputType()
export class HealthConditionInputType {
  @Field(() => ID) @IsUUID() healthConditionId!: string;
  @Field(() => ConditionStatusType) @IsEnum(ConditionStatusType) status!: ConditionStatusType;
  @Field(() => String, { nullable: true }) @IsOptional() @IsDateString() diagnosedAt?: string;
  @Field(() => String, { nullable: true }) @IsOptional() @IsString() @MaxLength(2000) notes?: string;
}

@InputType()
export class SetHealthConditionsInputType {
  @Field(() => [HealthConditionInputType]) @IsArray() @ArrayMaxSize(100) @ValidateNested({ each: true }) @Type(() => HealthConditionInputType) conditions!: HealthConditionInputType[];
}

@InputType()
export class SetDietaryPreferencesInputType {
  @Field(() => [DietaryPreferenceType]) @IsArray() @ArrayMaxSize(20) @IsEnum(DietaryPreferenceType, { each: true }) preferences!: DietaryPreferenceType[];
}

@ObjectType() export class UserProfileDataType {
  @Field(() => DecimalScalar, { nullable: true }) heightCm!: string | null;
  @Field(() => DecimalScalar, { nullable: true }) weightKg!: string | null;
  @Field(() => Date, { nullable: true }) birthDate!: Date | null;
  @Field(() => GenderType, { nullable: true }) gender!: GenderType | null;
  @Field(() => ActivityLevelType, { nullable: true }) activityLevel!: ActivityLevelType | null;
}
@ObjectType() export class UserGoalType {
  @Field(() => GoalTypeEnum) goalType!: GoalTypeEnum;
  @Field(() => DecimalScalar, { nullable: true }) targetWeightKg!: string | null;
  @Field(() => Int, { nullable: true }) calorieTarget!: number | null;
  @Field(() => Int, { nullable: true }) proteinTargetG!: number | null;
  @Field(() => Date) startedAt!: Date;
  @Field(() => Date, { nullable: true }) endedAt!: Date | null;
}
@ObjectType() export class UserPreferenceType {
  @Field(() => String, { nullable: true }) preferredDifficulty!: string | null;
  @Field(() => Int, { nullable: true }) maxPrepTimeMin!: number | null;
}
@ObjectType() export class PreferredCuisineType { @Field(() => ID) id!: string; @Field() code!: string; @Field() name!: string }
@ObjectType() export class HealthConditionCatalogType { @Field(() => ID) id!: string; @Field() code!: string; @Field() name!: string; @Field(() => HealthConditionGroupType) conditionGroup!: HealthConditionGroupType; @Field() isChronic!: boolean }
@ObjectType() export class UserAllergyType {
  @Field(() => ID) id!: string; @Field(() => ID) foodId!: string; @Field() foodName!: string;
  @Field(() => AllergySeverityType) severity!: AllergySeverityType; @Field(() => String, { nullable: true }) notes!: string | null;
}
@ObjectType() export class UserAllergyCategoryType {
  @Field(() => ID) id!: string; @Field(() => ID) categoryId!: string; @Field() categoryName!: string;
  @Field(() => AllergySeverityType) severity!: AllergySeverityType;
}
@ObjectType() export class UserHealthConditionType {
  @Field(() => ID) id!: string; @Field(() => ID) healthConditionId!: string; @Field() code!: string; @Field() name!: string;
  @Field(() => ConditionStatusType) status!: ConditionStatusType; @Field(() => Date, { nullable: true }) diagnosedAt!: Date | null;
  @Field(() => String, { nullable: true }) notes!: string | null;
}
@ObjectType() export class MyProfileType {
  @Field(() => ID) userId!: string;
  @Field(() => UserProfileDataType, { nullable: true }) profile!: UserProfileDataType | null;
  @Field(() => UserGoalType, { nullable: true }) goal!: UserGoalType | null;
  @Field(() => UserPreferenceType, { nullable: true }) preferences!: UserPreferenceType | null;
  @Field(() => [String]) dietaryPreferences!: string[];
  @Field(() => [PreferredCuisineType]) preferredCuisines!: PreferredCuisineType[];
  @Field(() => [String]) dislikedFoodIds!: string[];
  @Field(() => [String]) dislikedCategoryIds!: string[];
  @Field(() => [UserAllergyType]) allergies!: UserAllergyType[];
  @Field(() => [UserAllergyCategoryType]) allergyCategories!: UserAllergyCategoryType[];
  @Field(() => [UserHealthConditionType]) healthConditions!: UserHealthConditionType[];
}
@ObjectType() export class SafetyHistoryEventType {
  @Field(() => ID) id!: string; @Field(() => SafetyEntityTypeEnum) entityType!: SafetyEntityTypeEnum;
  @Field(() => ID) entityId!: string; @Field(() => SafetyEventActionEnum) action!: SafetyEventActionEnum;
  @Field() details!: string; @Field(() => Date) occurredAt!: Date;
}
@ObjectType() export class SafetyHistoryConnectionType {
  @Field(() => [SafetyHistoryEventType]) nodes!: SafetyHistoryEventType[];
  @Field() hasNextPage!: boolean; @Field(() => String, { nullable: true }) endCursor!: string | null;
}
