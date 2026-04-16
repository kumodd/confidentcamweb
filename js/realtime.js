// ============================================
// REALTIME SERVICE
// Supabase Realtime for live script updates
// ============================================

class RealtimeService {
    constructor() {
        this.supabase = null;
        this.subscription = null;
        this.callbacks = {
            onInsert: [],
            onUpdate: [],
            onDelete: []
        };
    }

    init() {
        this.supabase = getSupabase();
        return this;
    }

    // ============================================
    // SUBSCRIBE TO SCRIPT CHANGES
    // ============================================

    subscribeToScripts(userId) {
        if (this.subscription) {
            this.unsubscribe();
        }

        console.log('📡 Subscribing to realtime script updates...');

        this.subscription = this.supabase
            .channel('content_scripts_changes')
            .on(
                'postgres_changes',
                {
                    event: '*',
                    schema: 'public',
                    table: 'content_scripts',
                    filter: `user_id=eq.${userId}`
                },
                (payload) => this._handleChange(payload)
            )
            .subscribe((status) => {
                console.log('📡 Realtime subscription status:', status);
            });

        return this;
    }

    _handleChange(payload) {
        console.log('📡 Realtime change received:', payload.eventType, payload);

        switch (payload.eventType) {
            case 'INSERT':
                this.callbacks.onInsert.forEach(cb => cb(payload.new));
                break;
            case 'UPDATE':
                this.callbacks.onUpdate.forEach(cb => cb(payload.new, payload.old));
                break;
            case 'DELETE':
                this.callbacks.onDelete.forEach(cb => cb(payload.old));
                break;
        }
    }

    // ============================================
    // EVENT HANDLERS
    // ============================================

    onInsert(callback) {
        this.callbacks.onInsert.push(callback);
        return this;
    }

    onUpdate(callback) {
        this.callbacks.onUpdate.push(callback);
        return this;
    }

    onDelete(callback) {
        this.callbacks.onDelete.push(callback);
        return this;
    }

    // ============================================
    // UNSUBSCRIBE
    // ============================================

    unsubscribe() {
        if (this.subscription) {
            console.log('📡 Unsubscribing from realtime...');
            this.supabase.removeChannel(this.subscription);
            this.subscription = null;
        }

        // Clear callbacks
        this.callbacks = {
            onInsert: [],
            onUpdate: [],
            onDelete: []
        };
    }
}

// Create global instance
window.realtimeService = new RealtimeService();
