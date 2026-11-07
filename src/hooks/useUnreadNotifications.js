import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { fetchUnreadCount, NOTIFICATIONS_CHANGED } from '../lib/notificationsApi';

let channelSeq = 0;

// Live count of the user's unread notifications. Refreshes on realtime
// changes and whenever the app announces it changed read state itself.
export function useUnreadNotifications(userId) {
    const [count, setCount] = useState(0);

    useEffect(() => {
        if (!userId) return;
        let active = true;

        const refresh = () => {
            fetchUnreadCount(userId)
                .then((n) => active && setCount(n))
                .catch(() => {});
        };

        refresh();

        const channel = supabase
            .channel(`unread-notifications-${userId}-${++channelSeq}`)
            .on(
                'postgres_changes',
                {
                    event: '*',
                    schema: 'public',
                    table: 'notifications',
                    filter: `recipient_id=eq.${userId}`,
                },
                refresh
            )
            .subscribe();

        window.addEventListener(NOTIFICATIONS_CHANGED, refresh);

        return () => {
            active = false;
            window.removeEventListener(NOTIFICATIONS_CHANGED, refresh);
            supabase.removeChannel(channel);
        };
    }, [userId]);

    return userId ? count : 0;
}
