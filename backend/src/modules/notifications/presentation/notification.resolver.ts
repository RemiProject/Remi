import { UseGuards } from '@nestjs/common';
import { Args, Int, Mutation, Query, Resolver, Subscription } from '@nestjs/graphql';
import { SkipThrottle } from '@nestjs/throttler';
import { Ctx } from '@/platform/tenancy/ctx.decorator.js';
import { GqlAuthGuard } from '@/platform/tenancy/gql-auth.guard.js';
import type { RequestContext } from '@/platform/tenancy/request-context.js';
import { NotificationEvents, type NotificationEvent } from '@/modules/notifications/application/notification-events.js';
import { NotificationService } from '@/modules/notifications/application/notification.service.js';
import { NotificationChannelEnum, NotificationConnectionType, NotificationKindEnum, NotificationPreferenceType, NotificationReceivedType, NotificationItemType, UserDevicePlatformEnum, UserDeviceType, NotificationBadgeType } from './notification.types.js';

@Resolver()
@UseGuards(GqlAuthGuard)
export class NotificationResolver {
  constructor(private readonly service: NotificationService, private readonly events: NotificationEvents) {}

  @Query(() => NotificationConnectionType)
  notifications(@Ctx() ctx: RequestContext, @Args('first', { type: () => Int, defaultValue: 20 }) first: number, @Args('after', { type: () => String, nullable: true }) after?: string) {
    return this.service.visible(ctx.userId, first, after);
  }

  @Query(() => NotificationBadgeType)
  async notificationBadge(@Ctx() ctx: RequestContext) {
    const page = await this.service.unreadCount(ctx.userId);
    return { unreadCount: page };
  }

  @Query(() => [UserDeviceType])
  myDevices(@Ctx() ctx: RequestContext) { return this.service.devices(ctx.userId); }

  @Query(() => [NotificationPreferenceType])
  notificationPreferences(@Ctx() ctx: RequestContext) { return this.service.preferences(ctx.userId); }

  @Mutation(() => NotificationItemType)
  markNotificationRead(@Ctx() ctx: RequestContext, @Args('id') id: string) { return this.service.markRead(ctx.userId, id); }

  @Mutation(() => UserDeviceType)
  registerDevice(@Ctx() ctx: RequestContext, @Args('platform', { type: () => UserDevicePlatformEnum }) platform: UserDevicePlatformEnum,
    @Args('pushToken') pushToken: string, @Args('appVersion', { type: () => String, nullable: true }) appVersion?: string) {
    return this.service.registerDevice(ctx.userId, platform, pushToken, appVersion);
  }

  @Mutation(() => Boolean)
  revokeDevice(@Ctx() ctx: RequestContext, @Args('id') id: string) { return this.service.revokeDevice(ctx.userId, id); }

  @Mutation(() => NotificationPreferenceType)
  updateNotificationPreference(@Ctx() ctx: RequestContext,
    @Args('type', { type: () => NotificationKindEnum }) type: NotificationKindEnum,
    @Args('channel', { type: () => NotificationChannelEnum }) channel: NotificationChannelEnum,
    @Args('isEnabled') isEnabled: boolean,
    @Args('quietHoursStart', { type: () => String, nullable: true }) quietHoursStart?: string,
    @Args('quietHoursEnd', { type: () => String, nullable: true }) quietHoursEnd?: string) {
    return this.service.updatePreference(ctx.userId, type, channel, isEnabled, quietHoursStart, quietHoursEnd);
  }

  @SkipThrottle()
  @Subscription(() => NotificationReceivedType, {
    name: 'notificationReceived',
    resolve: (event: NotificationEvent) => ({ notificationId: event.notificationId, householdId: event.householdId }),
  })
  notificationReceived(@Ctx() ctx: RequestContext) {
    return this.events.subscribe(ctx.userId);
  }
}
