export type HouseholdRole = 'OWNER' | 'MEMBER';
export type TokenPurpose = 'EMAIL_VERIFY' | 'PASSWORD_RESET' | 'HOUSEHOLD_INVITATION';

export interface UserRecord {
  id: string;
  email: string;
  passwordHash: string;
  name: string;
  timezone: string;
  emailVerifiedAt: Date | null;
  languageCode: string; // preferred language (ar | en)
}

export interface HouseholdRecord { id: string; name: string; timezone: string }

export interface MembershipRecord { householdId: string; userId: string; role: HouseholdRole; joinedAt: Date; leftAt: Date | null }

export interface MemberView { userId: string; name: string; email: string; role: HouseholdRole; joinedAt: Date }
export interface MyHouseholdView { household: HouseholdRecord; role: HouseholdRole; joinedAt: Date }

export interface InvitationView { id: string; email: string; role: HouseholdRole; createdAt: Date }
export interface InvitationForAccept {
  id: string;
  householdId: string;
  email: string;
  role: HouseholdRole;
  acceptedAt: Date | null;
  revokedAt: Date | null;
  tokenId: string;
  tokenUsedAt: Date | null;
  tokenExpiresAt: Date;
}

export interface NewToken { id: string; userId: string | null; purpose: TokenPurpose; tokenHash: string; expiresAt: Date }
