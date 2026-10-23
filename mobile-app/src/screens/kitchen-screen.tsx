import { useState } from 'react';
import { router } from 'expo-router';
import { Keyboard, Modal, ScrollView, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { AppText, Button, Card, Chip, EmptyState, PageHeader, Screen, SearchField, SectionHeader, uiStyles } from '@/components/ui/core';
import { Icon } from '@/components/ui/icon';
import { FoodCard } from '@/components/food-card';
import { InventoryNotice } from '@/components/inventory-notice';
import { categoryOptions, storageOptions } from '@/domain/inventory';
import { useInventory, useToday } from '@/providers/inventory-provider';
import { useLanguage } from '@/providers/language-provider';
import { inventoryMessages } from '@/i18n/inventory';
import { activeKitchenFilterCount, defaultKitchenFilters, kitchenEmptyAction, kitchenView, type KitchenFilters } from '@/utils/kitchen-view';
import { layout, spacing } from '@/theme/tokens';
import { useRemyTheme } from '@/theme/provider';

export default function KitchenScreen() {
  const { items, status } = useInventory();
  const { language } = useLanguage();
  const { colors } = useRemyTheme();
  const today = useToday();
  const t = inventoryMessages[language];
  const rtl = language === 'ar';
  const [query, setQuery] = useState('');
  const [filters, setFilters] = useState<KitchenFilters>({ ...defaultKitchenFilters });
  const [draft, setDraft] = useState<KitchenFilters>({ ...defaultKitchenFilters });
  const [open, setOpen] = useState(false);
  const { category, storage, sort, priority } = filters;
  const visible = kitchenView(items, query, category, storage, sort, priority, today, language);
  const count = activeKitchenFilterCount(filters);
  const emptyAction = kitchenEmptyAction(items, query, filters, today, language);
  const row = { ...uiStyles.row, flexWrap: 'wrap' as const };
  const summary = [storage !== 'all' ? t[storage] : '', category !== 'all' ? t[category] : '', priority ? t.priority : '', sort === 'expiry' ? t.expiry : ''].filter(Boolean).join(' · ');
  const textStyle = { textAlign: rtl ? 'right' as const : 'left' as const };
  const showFilters = () => { Keyboard.dismiss(); setDraft({ ...filters }); setOpen(true); };
  const changeDraft = <K extends keyof KitchenFilters>(key: K, value: KitchenFilters[K]) => setDraft((current) => ({ ...current, [key]: value }));
  return <Screen><View style={{ gap: spacing.lg, direction: rtl ? 'rtl' : 'ltr' }}>
    <PageHeader title={t.title} subtitle={status === 'ready' ? `${items.length.toLocaleString(language)} ${t.saved}` : undefined}
      action={status === 'ready' && items.length > 0 ? <Button label={t.add} icon="add" variant="text" onPress={() => router.push('/food-entry')} /> : undefined} />
    <InventoryNotice />
    {status === 'ready' && (items.length === 0 ?
      <EmptyState title={t.empty} description={t.emptyBody} action={t.first} onPress={() => router.push('/food/manual')} /> : <>
        <SearchField value={query} onChangeText={setQuery} placeholder={t.search} accessibilityLabel={t.search} returnKeyType="search" autoCorrect={false}
          style={{ ...textStyle, writingDirection: rtl ? 'rtl' : 'ltr' }} />
        <View style={row}><AppText variant="caption" muted accessibilityLiveRegion="polite" style={[uiStyles.grow, textStyle]}>{visible.length.toLocaleString(language)} {t.results}</AppText>
          <Button label={`${t.filters}${count ? ` (${count.toLocaleString(language)})` : ''}`} icon="filter" variant="secondary" onPress={showFilters} /></View>
        {summary !== '' && <AppText variant="caption" muted style={textStyle}>{summary}</AppText>}
        {visible.length === 0 ? <View style={{ gap: spacing.sm, paddingVertical: spacing.md }}>
          <Icon name="search" size={28} color={colors.textSubtle} />
          <AppText variant="heading" style={textStyle}>{t.none}</AppText><AppText muted variant="caption" style={textStyle}>{t.noResultsHint}</AppText>
          {emptyAction && <View style={{ alignSelf: 'flex-start' }}><Button label={emptyAction === 'search' ? t.clearSearch : t.clearFilters} variant="text"
            onPress={() => emptyAction === 'search' ? setQuery('') : setFilters({ ...defaultKitchenFilters })} /></View>}
        </View> : storageOptions.filter((location) => (storage === 'all' || storage === location.id) && visible.some((item) => item.storageId === location.id)).map((location) => {
          const grouped = visible.filter((item) => item.storageId === location.id);
          return <View key={location.id} style={{ gap: spacing.sm }}><SectionHeader title={`${t[location.id]} · ${grouped.length.toLocaleString(language)}`} />
            <Card style={{ padding: 0, gap: 0 }}>{grouped.map((item, index) => <FoodCard key={item.id} item={item} showStorage={false} divider={index > 0} />)}</Card>
          </View>;
        })}
      </>)}
    <Modal visible={open} transparent animationType="slide" onRequestClose={() => setOpen(false)}>
      <SafeAreaView style={{ flex: 1, justifyContent: 'flex-end', backgroundColor: colors.overlay }}>
        <Card accessibilityViewIsModal style={{ padding: 0, maxHeight: '90%', maxWidth: layout.maxWidth, width: '100%', alignSelf: 'center', backgroundColor: colors.modalSurface }}>
          <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ padding: spacing.lg, gap: spacing.lg, direction: rtl ? 'rtl' : 'ltr' }}>
            <PageHeader title={t.filters} action={<Button label={t.close} variant="text" onPress={() => setOpen(false)} />} />
            <SectionHeader title={t.storage} />
            <View style={row}><Chip label={t.all} selected={draft.storage === 'all'} onPress={() => changeDraft('storage', 'all')} />
              {storageOptions.map((option) => <Chip key={option.id} label={t[option.id]} selected={draft.storage === option.id} onPress={() => changeDraft('storage', option.id)} />)}</View>
            <SectionHeader title={t.category} />
            <View style={row}><Chip label={t.all} selected={draft.category === 'all'} onPress={() => changeDraft('category', 'all')} />
              {categoryOptions.map((option) => <Chip key={option.id} label={t[option.id]} selected={draft.category === option.id} onPress={() => changeDraft('category', option.id)} />)}</View>
            <SectionHeader title={t.sort} />
            <View style={row}><Chip label={t.name} selected={draft.sort === 'name'} onPress={() => changeDraft('sort', 'name')} />
              <Chip label={t.expiry} selected={draft.sort === 'expiry'} onPress={() => changeDraft('sort', 'expiry')} /></View>
            <Chip label={t.priority} selected={draft.priority} onPress={() => changeDraft('priority', !draft.priority)} />
            {draft.priority && <AppText variant="caption" muted style={textStyle}>{t.safety}</AppText>}
            <Button label={t.apply} onPress={() => { setFilters({ ...draft }); setOpen(false); }} />
            <Button label={t.clearFilters} variant="text" onPress={() => setDraft({ ...defaultKitchenFilters })} />
          </ScrollView>
        </Card>
      </SafeAreaView>
    </Modal>
  </View></Screen>;
}