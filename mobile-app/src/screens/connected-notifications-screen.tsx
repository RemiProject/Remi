import { useEffect, useState } from 'react';
import { Linking, View } from 'react-native';
import { enablePush, type PushState } from '@/services/push-registration';
import { router } from 'expo-router';
import { AppText, Button, Card, Chip, EmptyState, SectionHeader, uiStyles } from '@/components/ui/core';
import { kitchenRequest, type Notification, type Preference } from '@/services/kitchen-api';
import { ConnectedScreen, DataNotice, Feedback, useAction, useCopy, useKitchenData } from './connected-ui';

export function ConnectedNotificationsScreen() {
  const copy = useCopy(); const state = useKitchenData(async () => {
    const nodes: Notification[] = []; let after: string | null = null;
    do {
      const page: { notifications: { nodes: Notification[]; pageInfo: { endCursor: string | null; hasNextPage: boolean } } } = await kitchenRequest('query Updates($after: String) { notifications(first: 50, after: $after) { nodes { id type createdAt readAt foodId inventoryItemId } pageInfo { endCursor hasNextPage } } }', { after });
      nodes.push(...page.notifications.nodes);
      if (!page.notifications.pageInfo.hasNextPage) break;
      const next = page.notifications.pageInfo.endCursor;
      if (!next || next === after) throw new Error('Notification history returned an invalid page.');
      after = next;
    } while (after);
    const { notificationPreferences } = await kitchenRequest<{ notificationPreferences: Preference[] }>('{ notificationPreferences { type channel isEnabled quietHoursStart quietHoursEnd } }');
    return { notifications: { nodes }, notificationPreferences };
  }); const action = useAction(state.reload);
  const [push, setPush] = useState<PushState | null>(null);
  useEffect(() => { let live = true; void enablePush(false).then(value => { if (live) setPush(value); }); return () => { live = false; }; }, []);
  const label = (type: string) => ({ EXPIRY_SOON: copy('Food approaching its date', 'طعام يقترب من تاريخه'), LOW_STOCK: copy('Running low', 'مخزون منخفض'), MEMBER_CHANGED: copy('Household update', 'تحديث الأسرة'), PURCHASE_RECEIVED: copy('Purchase received', 'استُلمت مشتريات'), RECOMMENDATION_READY: copy('Kitchen suggestion', 'اقتراح للمطبخ'), SAFETY_REVIEW: copy('Food needs your review', 'طعام يحتاج مراجعتك') })[type] ?? type.toLowerCase().replaceAll('_', ' ');
  return <ConnectedScreen title={copy('Notifications', 'الإشعارات')}><DataNotice {...state} /><Feedback message={action.message} />
    {state.data?.notifications.nodes.length === 0 && <EmptyState title={copy('All caught up.', 'أنت مطّلع على كل جديد.')} description={copy('Kitchen and household updates will appear here.', 'ستظهر تحديثات المطبخ والأسرة هنا.')} />}
    {state.data?.notifications.nodes.map(item => <Card key={item.id}><AppText variant="heading">{label(item.type)}</AppText><AppText variant="caption" muted>{new Date(item.createdAt).toLocaleString()}</AppText><View style={uiStyles.wrap}>{item.inventoryItemId && <Button label={copy('View food', 'عرض الطعام')} variant="secondary" onPress={() => router.push({ pathname: '/food/[id]', params: { id: item.inventoryItemId ?? '' } })} />}{!item.readAt && <Button label={copy('Mark read', 'تحديد كمقروء')} variant="text" disabled={action.busy} onPress={() => { void action.run(() => kitchenRequest('mutation ReadNotification($id: String!) { markNotificationRead(id: $id) { id readAt } }', { id: item.id })); }} />}</View></Card>)}
    {push && push !== 'unavailable' && <Card>
      <AppText variant="label">{copy('Reminders on this phone', 'التذكيرات على هذا الهاتف')}</AppText>
      <AppText muted>{push === 'on' ? copy('Remi will tell you when food is near its date or running low.', 'سيخبرك ريمي عندما يقترب الطعام من تاريخه أو يوشك على النفاد.')
        : push === 'blocked' ? copy('Notifications are off for Remi in Settings.', 'الإشعارات متوقفة لريمي في الإعدادات.')
        : copy('Get a nudge before food goes off.', 'احصل على تنبيه قبل أن يفسد الطعام.')}</AppText>
      {push === 'off' && <Button label={copy('Turn on reminders', 'تفعيل التذكيرات')} onPress={() => { void enablePush(true).then(setPush); }} />}
      {push === 'blocked' && <Button label={copy('Open Settings', 'فتح الإعدادات')} variant="secondary" onPress={() => { void Linking.openSettings(); }} />}
    </Card>}
    <SectionHeader title={copy('Email preferences', 'تفضيلات البريد الإلكتروني')} /><AppText muted>{copy('Updates always appear here too. Choose which ones also come by email.', 'تظهر التحديثات هنا دائمًا. اختر ما يصلك منها بالبريد أيضًا.')}</AppText>
    {['EXPIRY_SOON', 'LOW_STOCK', 'MEMBER_CHANGED', 'PURCHASE_RECEIVED', 'RECOMMENDATION_READY', 'SAFETY_REVIEW'].map(type => {
      const preference = state.data?.notificationPreferences.find(entry => entry.type === type && entry.channel === 'EMAIL'); const enabled = preference?.isEnabled ?? true;
      return <Card key={type}><AppText variant="label">{label(type)}</AppText><Chip label={enabled ? copy('Email on', 'البريد مفعّل') : copy('Email off', 'البريد متوقف')} selected={enabled} disabled={action.busy || !state.data} onPress={() => { void action.run(() => kitchenRequest('mutation Preference($type: NotificationType!, $channel: NotificationChannel!, $isEnabled: Boolean!) { updateNotificationPreference(type: $type, channel: $channel, isEnabled: $isEnabled) { type isEnabled } }', { type, channel: 'EMAIL', isEnabled: !enabled })); }} /></Card>;
    })}
  </ConnectedScreen>;
}
