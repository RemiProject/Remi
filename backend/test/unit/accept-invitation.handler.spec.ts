import { describe, expect, it, vi } from 'vitest';
import { AcceptInvitationCommand } from '@/modules/identity/application/commands/accept-invitation/accept-invitation.command.js';
import { AcceptInvitationHandler } from '@/modules/identity/application/commands/accept-invitation/accept-invitation.handler.js';
import { MemberJoinedEvent } from '@/modules/identity/domain/events/identity.events.js';
import { InvalidTokenError, InvitationEmailMismatchError, InvitationNotUsableError } from '@/modules/identity/domain/services/identity.errors.js';
import { fakeConfig, fakeTx } from '../support/fakes.js';

const future = new Date(Date.now() + 3_600_000);
const invitation = (over: Record<string, unknown> = {}) => ({
  id: 'inv1', householdId: 'hh1', email: 'sara@mail.com', role: 'MEMBER', acceptedAt: null, revokedAt: null, tokenId: 'tok1', tokenUsedAt: null, tokenExpiresAt: future, ...over,
});

function setup(inv: any, userEmail = 'sara@mail.com') {
  const deps = {
    tx: fakeTx(),
    eventBus: { publish: vi.fn() },
    users: { findById: vi.fn(async () => ({ id: 'u1', email: userEmail, emailVerifiedAt: new Date() })) },
    tokens: { consumeById: vi.fn(async () => true) },
    households: { lock: vi.fn(async () => undefined) },
    members: { joinOrRejoin: vi.fn(async () => undefined) },
    invitations: { lockByTokenHash: vi.fn(async () => inv), markAccepted: vi.fn(async () => undefined) },
  };
  const handler = new AcceptInvitationHandler(deps.tx as any, deps.eventBus as any, fakeConfig(), deps.users as any, deps.tokens as any, deps.households as any, deps.members as any, deps.invitations as any);
  return { handler, deps };
}
const run = (h: AcceptInvitationHandler) => h.execute(new AcceptInvitationCommand('u1', 'raw-token'));

describe('AcceptInvitationHandler', () => {
  it('joins the household, consumes the token and marks the invitation accepted', async () => {
    const { handler, deps } = setup(invitation());
    await expect(run(handler)).resolves.toEqual({ householdId: 'hh1' });
    expect(deps.households.lock).toHaveBeenCalledWith({}, 'hh1');
    expect(deps.tokens.consumeById).toHaveBeenCalledWith({}, 'tok1');
    expect(deps.members.joinOrRejoin).toHaveBeenCalledWith({}, expect.objectContaining({ householdId: 'hh1', userId: 'u1', role: 'MEMBER' }));
    expect(deps.invitations.markAccepted).toHaveBeenCalledWith({}, 'inv1');
    expect(deps.eventBus.publish).toHaveBeenCalledWith(expect.any(MemberJoinedEvent));
  });

  it('rejects unknown tokens, a different email, and used/revoked/expired invitations', async () => {
    await expect(run(setup(null).handler)).rejects.toBeInstanceOf(InvalidTokenError);
    await expect(run(setup(invitation(), 'other@mail.com').handler)).rejects.toBeInstanceOf(InvitationEmailMismatchError);
    for (const over of [{ acceptedAt: new Date() }, { revokedAt: new Date() }, { tokenUsedAt: new Date() }, { tokenExpiresAt: new Date(Date.now() - 1000) }]) {
      const { handler, deps } = setup(invitation(over));
      await expect(run(handler)).rejects.toBeInstanceOf(InvitationNotUsableError);
      expect(deps.members.joinOrRejoin).not.toHaveBeenCalled();
    }
  });

  it('loses the race when the token was consumed concurrently', async () => {
    const { handler, deps } = setup(invitation());
    deps.tokens.consumeById.mockResolvedValueOnce(false);
    await expect(run(handler)).rejects.toBeInstanceOf(InvitationNotUsableError);
    expect(deps.members.joinOrRejoin).not.toHaveBeenCalled();
  });
});
