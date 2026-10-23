import type { IconName } from '@/components/ui/icon';

export interface FeatureMenuItem { id: string; title: string; description: string; icon: IconName; unavailable?: boolean }
export const featureGroups: { title: string; items: FeatureMenuItem[] }[] = [
  { title: 'Plan & cook', items: [
    { id: 'chat', title: 'Remy Chat', icon: 'chat', description: 'Ask for kitchen help. AI chat is not connected.' },
    { id: 'recipes', title: 'Recipes', icon: 'recipe', description: 'Browse illustrative recipes and follow sample preparation steps.' },
    { id: 'planner', title: 'Meal Planner', icon: 'calendar', description: 'Manually plan meals using the existing sample recipes.' },
    { id: 'cooking', title: 'Cooking', icon: 'recipe', description: 'Choose a sample recipe and follow its steps in Cooking Mode.' },
    { id: 'leftovers', title: 'Leftovers', icon: 'food', description: 'Leftover tracking and ideas are planned.' },
    { id: 'shopping', title: 'Shopping List', icon: 'shopping', description: 'Manage a manual shopping list saved on this device.' },
  ] },
  { title: 'Stay connected', items: [
    { id: 'notifications', title: 'Notifications', icon: 'bell', description: 'Notifications and reminders are not enabled.' },
    { id: 'community', title: 'Community', icon: 'community', unavailable: true, description: 'Community is currently unavailable. Sharing, posts, and social interactions are not implemented.' },
  ] },
  { title: 'You & Remy', items: [
    { id: 'profile', title: 'Profile', icon: 'profile', description: 'Log in, create an account, or manage your session.' },
    { id: 'settings', title: 'Settings', icon: 'settings', description: 'Choose shared language and appearance preferences saved on this device.' },
    { id: 'contact', title: 'Contact Us', icon: 'contact', unavailable: true, description: 'Contact Us is currently unavailable. No support form or message-delivery service is connected.' },
  ] },
];
export const menuItems = featureGroups.flatMap((group) => group.items);
