
import {
    createContext,
    useContext,
    useEffect,
    useState,
} from 'react'

import { supabase, initialAuthLink } from '../lib/supabase'
import { absoluteUrl, markAccountOnDevice } from '../lib/authFlow'
import { consumeAuthPending, identify, resetAnalytics } from '../lib/analytics'

const AuthContext = createContext(null)

const RECOVERY_KEY = 'cx_password_recovery'

function readRecoveryFlag() {
    try {
        return window.sessionStorage.getItem(RECOVERY_KEY) === '1'
    } catch {
        return false
    }
}

function writeRecoveryFlag(value) {
    try {
        if (value) window.sessionStorage.setItem(RECOVERY_KEY, '1')
        else window.sessionStorage.removeItem(RECOVERY_KEY)
    } catch {
        // Storage unavailable; recovery still works for this page load.
    }
}

export function AuthProvider({ children }) {
    const [user, setUser] = useState(null)
    const [loading, setLoading] = useState(true)
    const [passwordRecovery, setPasswordRecovery] = useState(() => {
        if (initialAuthLink.isRecovery) writeRecoveryFlag(true)
        return initialAuthLink.isRecovery || readRecoveryFlag()
    })

    useEffect(() => {
        let mounted = true

        const getSession = async () => {
            const { data, error } = await supabase.auth.getSession()

            if (mounted) {
                if (error) {
                    console.error('Session error:', error.message)
                }

                setUser(data?.session?.user ?? null)
                setLoading(false)
            }
        }

        getSession()

        const {
            data: { subscription },
        } = supabase.auth.onAuthStateChange((event, session) => {
            if (!mounted) return

            setUser(session?.user ?? null)
            setLoading(false)

            if (event === 'PASSWORD_RECOVERY') {
                writeRecoveryFlag(true)
                setPasswordRecovery(true)
            }

            if (session?.user && (event === 'SIGNED_IN' || event === 'INITIAL_SESSION')) {
                markAccountOnDevice()
                identify(session.user.id)
                consumeAuthPending()
            }

            if (event === 'SIGNED_OUT') {
                writeRecoveryFlag(false)
                setPasswordRecovery(false)
                resetAnalytics()
            }
        })

        return () => {
            mounted = false
            subscription.unsubscribe()
        }
    }, [])

    const signup = async (email, password, name, captchaToken) => {
        return await supabase.auth.signUp({
            email,
            password,
            options: {
                data: {
                    full_name: name,
                },
                emailRedirectTo: absoluteUrl('/'),
                captchaToken,
            },
        })
    }

    const login = async (email, password, captchaToken) => {
        return await supabase.auth.signInWithPassword({
            email,
            password,
            options: { captchaToken },
        })
    }

    const loginWithProvider = async (provider, fromPath = '/') => {
        return await supabase.auth.signInWithOAuth({
            provider,
            options: { redirectTo: absoluteUrl(fromPath) },
        })
    }

    const sendMagicLink = async (email, fromPath = '/', captchaToken) => {
        return await supabase.auth.signInWithOtp({
            email,
            options: {
                shouldCreateUser: false,
                emailRedirectTo: absoluteUrl(fromPath),
                captchaToken,
            },
        })
    }

    const resendConfirmation = async (email, captchaToken) => {
        return await supabase.auth.resend({
            type: 'signup',
            email,
            options: {
                emailRedirectTo: absoluteUrl('/'),
                captchaToken,
            },
        })
    }

    const sendPasswordReset = async (email, captchaToken) => {
        return await supabase.auth.resetPasswordForEmail(email, {
            redirectTo: absoluteUrl('/reset-password'),
            captchaToken,
        })
    }

    const updatePassword = async (password) => {
        const result = await supabase.auth.updateUser({ password })
        if (!result.error) {
            writeRecoveryFlag(false)
            setPasswordRecovery(false)
        }
        return result
    }

    // Whether the signed-in user still needs the welcome flow. Stored per
    // user id so a different account is checked afresh.
    const [onboarding, setOnboarding] = useState({ userId: null, needed: false })
    const userId = user?.id

    useEffect(() => {
        if (!userId) return
        let active = true
        supabase
            .from('profiles')
            .select('onboarded_at')
            .eq('id', userId)
            .maybeSingle()
            .then(({ data, error }) => {
                if (!active) return
                // If the check fails, never block the app.
                setOnboarding({ userId, needed: !error && (!data || data.onboarded_at === null) })
            })
        return () => {
            active = false
        }
    }, [userId])

    const onboardingChecked = !userId || onboarding.userId === userId
    const needsOnboarding = Boolean(userId) && onboarding.userId === userId && onboarding.needed

    const completeOnboarding = async () => {
        if (!userId) return
        setOnboarding({ userId, needed: false })
        await supabase.from('profiles').update({ onboarded_at: new Date().toISOString() }).eq('id', userId)
    }

    const logout = async () => {
        return await supabase.auth.signOut()
    }

    return (
        <AuthContext.Provider
            value={{
                user,
                loading,
                passwordRecovery,
                onboardingChecked,
                needsOnboarding,
                completeOnboarding,
                signup,
                login,
                loginWithProvider,
                sendMagicLink,
                resendConfirmation,
                sendPasswordReset,
                updatePassword,
                logout,
            }}
        >
            {children}
        </AuthContext.Provider>
    )
}

export function useAuth() {
    return useContext(AuthContext)
}
