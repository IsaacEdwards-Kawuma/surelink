# PIN recovery

SureLink uses **4-digit PINs** for login. There is **no self-serve “forgot PIN”** flow.

## How to reset a user’s PIN (admin only)

1. Log in as an **admin**.
2. Go to **Settings → Users**.
3. Click **✏️ Edit** next to the user whose PIN you want to reset.
4. Enter a **new 4-digit PIN** in the PIN field (leave blank to keep their current PIN).
5. Click **Save User**.

The user can then sign in with the new PIN.

## PIN rules

- Exactly **4 digits**.
- **Weak PINs are rejected**, e.g. `1234`, `0000`, `1111`–`9999`, `0123`, `3210`, or any PIN made of a single repeated digit. Choose something less guessable.

## If the only admin forgets their PIN

- Restore from a backup that includes an admin account you know the PIN for, **or**
- Manually update the database: set that user’s `pin_hash` to the bcrypt hash of the new PIN (requires DB access and a small script or SQL).

For normal operation, have at least two admins so one can reset the other’s PIN via Settings → Users.
