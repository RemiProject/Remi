import { Image } from 'expo-image';
import { radii, spacing } from '@/theme/tokens';
import { ingredientImage } from '@/data/ingredient-images';
import { Icon } from '@/components/ui/icon';
import { InventoryMetadataEditor } from '@/components/inventory-metadata-editor';
import { useCallback, useEffect, useRef, useState } from 'react';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { ActivityIndicator, View, type ScrollViewInstance } from 'react-native';
import { AppText, ActionRow, Button, Card, Chip, EmptyState, PageHeader, Screen, SearchField, SectionHeader, TextTabs, uiStyles } from '@/components/ui/core';
import { useBackendKitchen } from '@/providers/backend-kitchen-provider';
import { useInventory } from '@/providers/inventory-provider';
import { useLanguage } from '@/providers/language-provider';
import { backendKitchenMessages, daysLeftLabel } from '@/i18n/backend-kitchen';
import { backendAddFoodMessages } from '@/i18n/backend-add-food';
import { stockActionMessages } from '@/i18n/backend-stock-actions';
import { BackendStockActions } from '@/components/backend-stock-actions';
import type { InventoryReadItem } from '@/domain/backend-inventory-read-model';
import { backendExpiryDays, backendFoodName, backendKitchenView, backendQuantityLabel, backendRowSubtitle, backendStorageLabel, inventoryNumberLabel } from '@/utils/backend-kitchen-view';
import { useRemyTheme } from '@/theme/provider';
import HomeScreen from './home-screen';
import { BackendHomeRecipeIdeas } from './backend-home-recipe-ideas';

function useLabels() {
  const { language } = useLanguage();
  return { language, t: backendKitchenMessages[language], rtl: language === 'ar' };
}
function Expiry({ item }: { item: InventoryReadItem }) {
  const { today } = useBackendKitchen();
  const { language, t } = useLabels();
  const days = backendExpiryDays(item, today); const { colors } = useRemyTheme();
  // Soon is pink, past is red; everything else stays quiet.
  const color = days === null ? undefined : days < 0 ? colors.errorText : days <= 3 ? colors.accentText : undefined;
  return <AppText variant="caption" muted={!color} dir={language === 'ar' ? 'rtl' : undefined} style={color ? { color } : undefined}>{days === null ? t.unknown : days < 0 ? t.expired : days === 0 ? t.today : daysLeftLabel(language, inventoryNumberLabel(days.toLocaleString(language), language), days, item.expiryEstimated)}</AppText>;
}
function Fact({ label, first, children }: { label: string; first?: boolean; children: React.ReactNode }) {
  const { colors } = useRemyTheme();
  return <View style={[uiStyles.row, { justifyContent: 'space-between', minHeight: 48, paddingVertical: 10, borderTopWidth: first ? 0 : 1, borderColor: colors.divider }]}>
    <AppText muted>{label}</AppText>{typeof children === 'string' ? <AppText variant="label">{children}</AppText> : children}
  </View>;
}
export function BackendKitchenState({ detail = false, retry }: { detail?: boolean; retry?: () => void }) {
  const state = useBackendKitchen();
  const { t } = useLabels();
  const status = state.status === 'signed-out' ? 'signed-out' : detail ? state.detail?.status ?? (state.status === 'error' ? 'error' : 'loading') : state.status;
  if (status === 'signed-out') return <EmptyState title={t.signInTitle} description={t.signInBody} action={t.signIn} onPress={() => router.push('/login')} />;
  if (status === 'loading') return <View style={uiStyles.row}><ActivityIndicator /><AppText accessibilityLiveRegion="polite">{t.loading}</AppText></View>;
  if (status === 'error') return <Card><AppText accessibilityRole="alert">{detail ? t.notFound : t.error}</AppText><Button label={t.retry} onPress={retry ?? state.retry} /></Card>;
  return null;
}
function DeviceInventoryNotice() {
  const { items, status, retryRead } = useInventory();
  const { language, t } = useLabels();
  if (status === 'ready' && items.length === 0) return null;
  return <Card><SectionHeader title={`${t.device}${status === 'ready' ? ` · ${items.length.toLocaleString(language)}` : ''}`} />
    <AppText variant="caption" muted>{t.deviceBody}</AppText>
    {status === 'error' ? <><AppText accessibilityRole="alert">{t.deviceError}</AppText><Button label={t.retry} onPress={retryRead} /></> : status !== 'ready' && <AppText muted>{t.deviceLoading}</AppText>}
  </Card>;
}
function BackendFoodRow({ item, divider }: { item: InventoryReadItem; divider?: boolean }) {
  const { language, t, rtl } = useLabels();
  return <ActionRow dense divider={divider} title={backendFoodName(item, language)} rtl={rtl} leading={<View style={{ width: 56, height: 56, alignItems: 'center', justifyContent: 'center' }}>{ingredientImage(item.name) ? <Image source={ingredientImage(item.name)} contentFit="cover" accessibilityLabel={backendFoodName(item, language)} style={{ width: 56, height: 56, borderRadius: radii.md }} /> : <Icon name="food" size={28} />}</View>}
    subtitle={backendRowSubtitle(item, language)} subtitleDirection={rtl ? 'rtl' : undefined} subtitleStyle={{ writingDirection: rtl ? 'rtl' : 'ltr' }}
    onPress={() => router.push({ pathname: '/food/[id]', params: { id: item.id } })}>
    <Expiry item={item} />{item.readOnly && <AppText variant="caption" muted>{t.readOnly}</AppText>}
  </ActionRow>;
}

export function BackendKitchenScreen() {
  const { items, status, today, owner, additionNotice, additionNoticeKind, dismissAdded } = useBackendKitchen();
  const { language, t, rtl } = useLabels();
  const { colors } = useRemyTheme();
  const scrollRef = useRef<ScrollViewInstance>(null);
  const [query, setQuery] = useState('');
  const [storage, setStorage] = useState('all');
  const [sort, setSort] = useState<'name' | 'expiry'>('expiry');
  const [priority, setPriority] = useState(false);
  useFocusEffect(useCallback(() => {
    if (additionNotice == null || !owner) return;
    scrollRef.current?.scrollTo({ y: 0, animated: false });
    const timer = setTimeout(() => dismissAdded(additionNotice), 3500);
    return () => clearTimeout(timer);
  }, [additionNotice, dismissAdded, owner]));
  const visible = backendKitchenView(items, query, storage, sort, priority, today, language);
  const storages = [...new Map(items.map(item => [item.storageId ?? item.backendStorageLocation, backendStorageLabel(item, language)])).entries()];
  return <Screen rtl={rtl} scrollRef={scrollRef}><PageHeader title={language === 'ar' ? 'مطبخي' : 'My kitchen'} subtitle={status === 'ready' ? `${inventoryNumberLabel(items.length.toLocaleString(language), language)} ${t.saved}` : undefined} subtitleDirection={rtl ? 'rtl' : undefined}
    action={<Button label={t.add} icon="add" disabled={status !== 'ready'} onPress={() => router.push('/food/manual')} />} />
    {additionNotice != null && owner && <Card style={{ backgroundColor: colors.successSurface }}><AppText accessibilityLiveRegion="polite" style={{ color: colors.successText }}>{additionNoticeKind === 'updated' ? stockActionMessages[language].updated : backendAddFoodMessages[language].added}</AppText></Card>}
    <BackendKitchenState />
    {status === 'ready' && <>
      {items.length === 0 ? <EmptyState title={t.empty} description={t.emptyBody} /> : <>
        <SearchField value={query} onChangeText={setQuery} placeholder={t.search} accessibilityLabel={t.search} style={{ textAlign: rtl ? 'right' : 'left' }} />
          {/* Where it is kept, as the same text tabs the cookbook uses; then how to order it, in one row. */}
          <View style={{ gap: spacing.xs }}>
            <TextTabs tabs={[{ key: 'all', label: t.all }, ...storages.map(([key, label]) => ({ key, label }))]} value={storage} onChange={setStorage} rtl={rtl} />
            <View style={uiStyles.wrap}><Chip label={t.expiry} selected={sort === 'expiry'} onPress={() => setSort('expiry')} /><Chip label={t.name} selected={sort === 'name'} onPress={() => setSort('name')} />
              <Chip label={t.useFirst} selected={priority} onPress={() => setPriority(!priority)} /></View>
          </View>
          {visible.length ? <Card style={{ padding: 0, gap: 0 }}>{visible.map((item, index) => <BackendFoodRow key={item.id} item={item} divider={index > 0} />)}</Card> : <EmptyState title={t.none} description="" action={t.clear} onPress={() => { setQuery(''); setStorage('all'); setPriority(false); }} />}
      </>}
    </>}
    <DeviceInventoryNotice />
  </Screen>;
}

export function BackendHomeScreen() {
  const state = useBackendKitchen();
  const { language, t } = useLabels();
  return <HomeScreen backend={{
    ...state,
    recipeIdeas: state.status === 'signed-out' ? null : <BackendHomeRecipeIdeas kitchenStatus={state.status} />,
    notice: state.status === 'signed-out'
      ? <EmptyState title={t.homeSignInTitle} description={t.signInBody} action={t.signIn} onPress={() => router.push('/login')} />
      : <BackendKitchenState />,
    deviceNotice: <DeviceInventoryNotice />,
    saved: t.saved, empty: t.empty, emptyBody: t.emptyBody, writesSoon: t.writesSoon, readOnly: t.readOnly,
    quantityLabel: item => backendQuantityLabel(item, language),
    foodName: item => backendFoodName(item, language),
  }} />;
}

export function BackendFoodDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { detail, owner, loadDetail, additionNotice, additionNoticeKind, dismissAdded } = useBackendKitchen();
  const { language, t, rtl } = useLabels();
  const { colors } = useRemyTheme();
  const scrollRef = useRef<ScrollViewInstance>(null);
  useEffect(() => { if (owner) void loadDetail(id); }, [owner, id, loadDetail]);
  useFocusEffect(useCallback(() => {
    if (!owner || additionNotice == null || additionNoticeKind !== 'updated') return;
    scrollRef.current?.scrollTo({ y: 0, animated: false });
    const timer = setTimeout(() => dismissAdded(additionNotice), 3500);
    return () => clearTimeout(timer);
  }, [owner, additionNotice, additionNoticeKind, dismissAdded]));
  const item = detail?.id === id && detail.status === 'ready' ? detail.item : undefined;
  return <Screen rtl={rtl} scrollRef={scrollRef}><Button label={t.back} icon="back" rtl={rtl} variant="text" onPress={() => router.canGoBack() ? router.back() : router.replace('/kitchen')} />
    {owner && additionNotice != null && additionNoticeKind === 'updated' && <Card style={{ backgroundColor: colors.successSurface }}><AppText accessibilityLiveRegion="polite" style={{ color: colors.successText }}>{stockActionMessages[language].updated}</AppText></Card>}
    <BackendKitchenState detail retry={() => { void loadDetail(id); }} />
    {item && <>
      {ingredientImage(item.name) && <Image source={ingredientImage(item.name)} contentFit="cover" accessibilityLabel={backendFoodName(item, language)} style={{ width: '100%', aspectRatio: 16 / 10, borderRadius: radii.lg }} />}
      <PageHeader title={backendFoodName(item, language)} subtitle={backendQuantityLabel(item, language)} subtitleDirection={rtl ? 'rtl' : undefined} />
      {/* The facts as label and value rows, one per line, so the eye reads down one column of values. */}
      <Card style={{ gap: 0, paddingVertical: 4 }}>
        <Fact label={t.storage} first>{backendStorageLabel(item, language)}</Fact>
        <Fact label={t.expiry}><View style={{ alignItems: 'flex-end' }}><AppText>{item.expirationDate ?? t.unknown}</AppText><Expiry item={item} /></View></Fact>
        {item.purchaseDate && <Fact label={t.bought}>{item.purchaseDate}</Fact>}
      </Card>
      {(item.expiryEstimated || item.readOnly) && <AppText variant="caption" muted>{[item.expiryEstimated && t.estimated, item.readOnly && t.readOnly].filter(Boolean).join(' ')}</AppText>}
      <BackendStockActions key={`${owner}:${id}`} item={item} />
      <InventoryMetadataEditor key={`${id}:${item.version}`} item={item} />
    </>}
  </Screen>;
}

export function BackendWritesUnavailableScreen() {
  const { t, rtl } = useLabels();
  return <Screen rtl={rtl}><PageHeader title={t.add} /><AppText>{t.writesSoon}</AppText><Button label={t.add} disabled />
    <Button label={t.back} variant="text" onPress={() => router.replace('/kitchen')} /></Screen>;
}
