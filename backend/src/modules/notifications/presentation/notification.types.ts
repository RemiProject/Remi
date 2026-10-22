import { Field, Int, ObjectType, registerEnumType } from '@nestjs/graphql';

export enum NotificationKindEnum { EXPIRY_SOON = 'EXPIRY_SOON', LOW_STOCK = 'LOW_STOCK', RECOMMENDATION_READY = 'RECOMMENDATION_READY', SAFETY_REVIEW = 'SAFETY_REVIEW', PURCHASE_RECEIVED = 'PURCHASE_RECEIVED', MEMBER_CHANGED = 'MEMBER_CHANGED' }
export enum NotificationChannelEnum { PUSH = 'PUSH', EMAIL = 'EMAIL' }
export enum UserDevicePlatformEnum { IOS = 'IOS', ANDROID = 'ANDROID', WEB = 'WEB' }
registerEnumType(NotificationKindEnum, { name: 'NotificationType' });
registerEnumType(NotificationChannelEnum, { name: 'NotificationChannel' });
registerEnumType(UserDevicePlatformEnum, { name: 'UserDevicePlatform' });

@ObjectType()
export class NotificationItemType {
  @Field() id!: string;
  @Field() householdId!: string;
  @Field(() => NotificationKindEnum) type!: NotificationKindEnum;
  @Field(() => String, { nullable: true }) foodId!: string | null;
  @Field(() => String, { nullable: true }) inventoryItemId!: string | null;
  @Field(() => Date) createdAt!: Date;
  @Field(() => Date, { nullable: true }) readAt!: Date | null;
}

@ObjectType()
export class NotificationPageInfoType {
  @Field() hasNextPage!: boolean;
  @Field(() => String, { nullable: true }) endCursor!: string | null;
}
@ObjectType()
export class NotificationConnectionType {
  @Field(() => [NotificationItemType]) nodes!: NotificationItemType[];
  @Field(() => NotificationPageInfoType) pageInfo!: NotificationPageInfoType;
}
@ObjectType()
export class UserDeviceType {
  @Field() id!: string;
  @Field(() => UserDevicePlatformEnum) platform!: UserDevicePlatformEnum;
  @Field(() => String, { nullable: true }) appVersion!: string | null;
  @Field(() => Date) lastSeenAt!: Date;
  @Field(() => Date, { nullable: true }) revokedAt!: Date | null;
}
@ObjectType()
export class NotificationPreferenceType {
  @Field(() => NotificationKindEnum) type!: NotificationKindEnum;
  @Field(() => NotificationChannelEnum) channel!: NotificationChannelEnum;
  @Field() isEnabled!: boolean;
  @Field(() => String, { nullable: true }) quietHoursStart!: string | null;
  @Field(() => String, { nullable: true }) quietHoursEnd!: string | null;
  @Field(() => Date, { nullable: true }) updatedAt!: Date | null;
}
@ObjectType()
export class NotificationReceivedType {
  @Field() notificationId!: string;
  @Field() householdId!: string;
}
@ObjectType()
export class NotificationBadgeType {
  @Field(() => Int) unreadCount!: number;
}
