import { useState } from 'react';
import { AppText, Button, Card } from '@/components/ui/core';
import { useLanguage } from '@/providers/language-provider';
import { getBackend } from '@/services/backend';

export function BackendConnection() {
  const { language } = useLanguage();
  const arabic = language === 'ar';
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState('');
  async function check() {
    setBusy(true);
    setStatus('');
    try {
      const backend = getBackend();
      await backend.checkConnection();
      setStatus(arabic ? 'تم الاتصال بالخادم وواجهة GraphQL وكتالوج الأطعمة.' : 'Backend, GraphQL, and food catalog reachable.');
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'Connection failed');
    } finally {
      setBusy(false);
    }
  }
  return <Card>
    <AppText variant="heading">{arabic ? 'اتصال الخادم' : 'Backend connection'}</AppText>
    <Button variant="secondary" disabled={busy} label={busy ? (arabic ? 'جارٍ الفحص…' : 'Checking…') : (arabic ? 'فحص الاتصال' : 'Check connection')} onPress={check} />
    {status ? <AppText accessibilityLiveRegion="polite" muted>{status}</AppText> : null}
  </Card>;
}
