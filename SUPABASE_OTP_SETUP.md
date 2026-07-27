# Supabase email OTP setup

Prime Role uses email/password signup followed by a six-digit email OTP. Complete
these hosted Supabase settings before testing signup.

1. In **Authentication → Providers → Email**, enable Email signups and keep
   **Confirm email** enabled.
2. Configure **custom SMTP first** in **Authentication → SMTP Settings**. Add
   the host, port, username, password, sender email, and sender name supplied by
   your email provider. Supabase recommends providers such as Resend, Postmark,
   SendGrid, or Amazon SES.
3. After custom SMTP is active, open
   **Authentication → Email Templates → Confirm signup**.
4. Replace confirmation-link content with an OTP-only template:

   ```html
   <h2>Verify your Prime Role email</h2>
   <p>Enter this six-digit code in Prime Role:</p>
   <h1 style="letter-spacing: 8px">{{ .Token }}</h1>
   <p>If you did not create this account, you can ignore this email.</p>
   ```

5. Save the template. Do not include `{{ .ConfirmationURL }}` in the Confirm
   Signup template.
6. Set the email OTP expiry to 3600 seconds or less, then test signup at
   `http://localhost:8788/signup`.

The browser needs only the Supabase project URL and publishable key. Never put a
service-role key, SMTP password, database password, or other secret in
`web/`, `worker/`, Git, or any browser-readable configuration.
