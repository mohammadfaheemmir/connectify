export const MIN_PASSWORD_LENGTH = 8

// A short list of the most common passwords. Supabase's leaked-password
// protection (when enabled) does the thorough check on the server.
const COMMON = new Set([
    'password', 'password1', 'password123', '12345678', '123456789', '1234567890',
    'qwerty123', 'qwertyuiop', '11111111', '00000000', 'iloveyou', 'abc12345',
    'sunshine', 'princess', 'football', 'baseball', 'welcome1', 'admin123',
    'letmein1', 'connectify',
])

export function checkPassword(password) {
    return {
        length: password.length >= MIN_PASSWORD_LENGTH,
        uncommon: password.length > 0 && !COMMON.has(password.toLowerCase()),
    }
}

export function isPasswordAcceptable(password) {
    const c = checkPassword(password)
    return c.length && c.uncommon
}
