export const OutboxTopics = {
  EmailVerifyRequested: 'auth.email_verify_requested',
  PasswordResetRequested: 'auth.password_reset_requested',
  PasswordChanged: 'auth.password_changed',
  HouseholdInvitationCreated: 'household.invitation_created',
} as const;
