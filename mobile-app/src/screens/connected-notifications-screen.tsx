import { View } from 'react-native';
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
  const label = (type: string) => ({ EXPIRY_SOON: copy('Food approaching its date', 'طعام يقترب من تاريخه'), LOW_STOCK: copy('Running low', 'مخزون منخفض'), MEMBER_CHANGED: copy('Household update', 'تحديث الأسرة'), PURCHASE_RECEIVED: copy('Purchase received', 'استُلمت مشتريات'), RECOMMENDATION_READY: copy('Kitchen suggestion', 'اقتراح للمطبخ'), SAFETY_REVIEW: copy('Food needs your review', 'طعام يحتاج مراجعتك') })[type] ?? type.toLowerCase().replaceAll('_', ' ');
  return <ConnectedScreen title={copy('Notifications', 'الإشعارات')}><DataNotice {...state} /><Feedback message={action.message} />
    {state.data?.notifications.nodes.length === 0 && <EmptyState title={copy('All caught up.', 'أنت مطّلع على كل جديد.')} description={copy('Kitchen and household updates will appear here.', 'ستظهر تحديثات المطبخ والأسرة هنا.')} />}
    {state.data?.notifications.nodes.map(item => <Card key={item.id}><AppText variant="heading">{label(item.type)}</AppText><AppText variant="caption" muted>{new Date(item.createdAt).toLocaleString()}</AppText><View style={uiStyles.wrap}>{item.inventoryItemId && <Button label={copy('View food', 'عرض الطعام')} variant="secondary" onPress={() => router.push({ pathname: '/food/[id]', params: { id: item.inventoryItemId ?? '' } })} />}{!item.readAt && <Button label={copy('Mark read', 'تحديد كمقروء')} variant="text" disabled={action.busy} onPress={() => { void action.run(() => kitchenRequest('mutation ReadNotification($id: String!) { markNotificationRead(id: $id) { id readAt } }', { id: item.id })); }} />}</View></Card>)}
    <SectionHeader title={copy('Email preferences', 'تفضيلات البريد الإلكتروني')} /><AppText muted>{copy('In-app updates remain available. Email delivery uses the configured mail service; this independent development build sends mail to its local inbox.', 'تبقى التحديثات داخل التطبيق متاحة. يستخدم البريد الخدمة المهيأة؛ ترسل نسخة التطوير إلى صندوق البريد المحلي.')}</AppText>
    {['EXPIRY_SOON', 'LOW_STOCK', 'MEMBER_CHANGED', 'PURCHASE_RECEIVED', 'RECOMMENDATION_READY', 'SAFETY_REVIEW'].map(type => {
      const preference = state.data?.notificationPreferences.find(entry => entry.type === type && entry.channel === 'EMAIL'); const enabled = preference?.isEnabled ?? true;
      return <Card key={type}><AppText variant="label">{label(type)}</AppText><Chip label={enabled ? copy('Email on', 'البريد مفعّل') : copy('Email off', 'البريد متوقف')} selected={enabled} disabled={action.busy || !state.data} onPress={() => { void action.run(() => kitchenRequest('mutation Preference($type: NotificationType!, $channel: NotificationChannel!, $isEnabled: Boolean!) { updateNotificationPreference(type: $type, channel: $channel, isEnabled: $isEnabled) { type isEnabled } }', { type, channel: 'EMAIL', isEnabled: !enabled })); }} /></Card>;
    })}
    <AppText variant="caption" muted>{copy('Remote push needs Firebase/APNs credentials and a registered physical device; in-app notifications and preferences work independently.', 'تحتاج الإشعارات الخارجية بيانات Firebase/APNs وجهازًا حقيقيًا مسجّلًا؛ تعمل إشعارات التطبيق والتفضيلات بشكل مستقل.')}</AppText>
  </ConnectedScreen>;
}
