
import {
    createContext,
    useContext,
    useEffect,
    useState,
} from 'react'

import { supabase } from '../lib/supabase'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
    const [user, setUser] = useState(null)
    const [loading, setLoading] = useState(true)

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
        } = supabase.auth.onAuthStateChange((_event, session) => {
            if (mounted) {
                setUser(session?.user ?? null)
                setLoading(false)
            }
        })

        return () => {
            mounted = false
            subscription.unsubscribe()
        }
    }, [])

    const signup = async (email, password, name) => {
        return await supabase.auth.signUp({
            email,
            password,
            options: {
                data: {
                    full_name: name,
                },
            },
        })
    }

    const login = async (email, password) => {
        return await supabase.auth.signInWithPassword({
            email,
            password,
        })
    }

    const logout = async () => {
        return await supabase.auth.signOut()
    }

    return (
        <AuthContext.Provider
            value={{
                user,
                loading,
                signup,
                login,
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
