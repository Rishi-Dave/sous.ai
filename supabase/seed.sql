-- Demo user for local dev and hackathon demo.
-- user_id: 00000000-0000-0000-0000-000000000001
-- Use this UUID as user_id when calling POST /sessions.

INSERT INTO auth.users (
    id,
    instance_id,
    email,
    encrypted_password,
    email_confirmed_at,
    role,
    aud
)
VALUES (
    '00000000-0000-0000-0000-000000000001',
    '00000000-0000-0000-0000-000000000000',
    'demo@sous.ai',
    '',
    now(),
    'authenticated',
    'authenticated'
)
ON CONFLICT DO NOTHING;

INSERT INTO public.profiles (user_id, display_name)
VALUES ('00000000-0000-0000-0000-000000000001', 'Demo Chef')
ON CONFLICT DO NOTHING;
