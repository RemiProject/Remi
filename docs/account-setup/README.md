# Creating a Remi account on an iPhone

Walked through end to end on 8 November 2026: the account was created in the app, signed in by username, confirmed in
the database (with its household), and signed in again through the Mac's Wi-Fi address that the phone build uses.

How to create an account in the Remi app (version 3, local development server). The screenshots come from the iOS
Simulator, which runs the same app as a phone install. They were taken before the email code step (step 4) was added,
so that step has no screenshot.

## Before you start

- The phone and the Mac are on the same Wi-Fi network.
- On the Mac, Docker (the database) and the API are running, and the API answers on port 3000. The phone build has
  the Mac's Wi-Fi address built in (`EXPO_PUBLIC_API_URL`, for example `http://192.168.1.7:3000`). If that address
  changes, rebuild the app.
- The API has migration 0035 applied and `EMAIL_VERIFICATION_CODE_SECRET` set, or the email has no code
  ([backend setup](../../backend/README.md#required-for-email-verification-codes)).
- Verification mail goes to Mailpit on the Mac (`http://localhost:8025` there), not to a real inbox.
- This dev server doesn't require a verified email to log in (`EMAIL_VERIFICATION_REQUIRED=false`), so you can also
  skip the code and verify later from Profile.

## Steps

### 1. Open Profile

Tap the round account button at the top right of Home, or go to **More → Your account**. When you're signed out,
Profile shows **Log in** and **Create account**. Tap **Create account**.

![Profile when signed out](01-profile-signed-out.png)

### 2. Fill in your details

![Create account form](02-create-account-details.png)

| Field | Rule |
|---|---|
| Full name | Up to 100 characters, not blank |
| Username | 3–30 characters. Starts with a letter, then letters, digits or `_`. Stored in lower case, so it must be unique ignoring case |
| Email | A valid address, unique to this account |
| Country | **Egypt +20** or **Saudi Arabia +966** |
| Mobile phone number | Egypt: `010`, `011`, `012` or `015` followed by 8 digits (for example `010 1234 5678`). Saudi Arabia: `05` followed by 8 digits. Arabic digits are fine |
| Password | 8–128 characters, with at least one uppercase letter, one number and one special character. The four yellow checks tick as each rule is met |
| Confirm password | The same password again |

![All four password rules met](03-password-rules-met.png)

### 3. Create the account

Tap **Create account**.

- **First time on the phone:** iOS asks to let Remi find devices on your local network. Tap **Allow**, or the request
  can't reach the Mac. If you missed it, turn it on in Settings → Privacy & Security → Local Network → Remi.
- **On success** the form is replaced by the **Check your email** screen. You are not signed in yet.
- The server also creates a household called **My Kitchen**, with you as its owner.

### 4. Enter the 6-digit code

1. In Mailpit, open the newest message to your email and note its 6-digit code.
2. Type or paste the code in the app and tap **Verify email**. Arabic digits are fine.

Remi signs you in and opens Profile, which shows your name and email. If it can't sign you in, it says your email is
verified and shows **Log in**.

- The code is valid for 15 minutes and stops working after 5 wrong attempts.
- **Resend code** becomes available after 60 seconds. Only the newest code works.
- **Back to log in** skips this step. The password you chose is then forgotten, so you log in yourself.

### 5. Log in later

Enter your **email or username** and your password, then tap **Log in**.

![Log in](05-log-in.png)

If your email isn't verified yet:

- **Where the server requires it** (`EMAIL_VERIFICATION_REQUIRED=true`), the login is refused and the code screen opens.
  Your email is filled in if you logged in with it; if you used your username, enter your email. Tap **Send code** for
  a new code, verify, then log in again.
- **On this dev server** you are signed in and Profile says "Email not verified". Tap **Verify email** there, tap
  **Send code** if you need a new code, and enter it. Remi returns to Profile.

![Signed in, before the Verify email button was added](06-signed-in-profile.png)

## Good to know

- **Your data on this phone:** the notice under the form explains that inventory, shopping lists and meal plans stay
  on the device. Signing in doesn't copy what you entered before signing in.
- **Too many attempts:** the server allows 10 sign-in or sign-up attempts per minute from one network address. After
  that you see "Too many requests"; wait a minute and try again.
- **Common errors:**
  - Username or email already in use: pick another.
  - "That code is wrong or expired": use the newest email, or request a new code.
  - The email has a link but no code: the API has no `EMAIL_VERIFICATION_CODE_SECRET`.
  - Phone number rejected: it doesn't match the Egypt or Saudi format above.
  - Connection error: the Mac is asleep, the API isn't running, the phone is on a different network, or Local Network
    access is off.
- **Testing again from scratch:** Profile → **Log out**, then repeat from step 1 with a new username and email.
