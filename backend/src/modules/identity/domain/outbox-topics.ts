export const OutboxTopics = {
  EmailVerifyRequested: 'auth.email_verify_requested',
  PasswordResetRequested: 'auth.password_reset_requested',
  /** Holds a requested email until the lookup worker has processed it, then blanked. */
  PasswordResetLookup: 'auth.password_reset_lookup',
  PasswordChanged: 'auth.password_changed',
  HouseholdInvitationCreated: 'household.invitation_created',
} as const;
