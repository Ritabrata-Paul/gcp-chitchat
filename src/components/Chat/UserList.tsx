import { useEffect, useState } from 'react';
import { supabase } from '../../config/supabase';
import { useAuth } from '../../contexts/AuthContext';
import { User, Circle } from 'lucide-react';

interface Profile {
  id: string;
  email: string;
  display_name: string;
  avatar_url?: string;
  online_status: boolean;
  last_seen: string;
}

interface LastMessage {
  content: string;
  created_at: string;
  sender_id: string;
  message_type: string;
}

interface UserWithMessages extends Profile {
  unreadCount: number;
  lastMessage?: LastMessage;
}

interface UserListProps {
  selectedUserId: string | null;
  onSelectUser: (userId: string, displayName: string) => void;
}

export const UserList = ({ selectedUserId, onSelectUser }: UserListProps) => {
  const [users, setUsers] = useState<UserWithMessages[]>([]);
  const [loading, setLoading] = useState(true);
  const { user } = useAuth();

  useEffect(() => {
    if (user) {
      loadUsers();
      
      // Set up real-time subscription for profiles
      const profileChannel = supabase
        .channel('profiles_realtime')
        .on(
          'postgres_changes',
          {
            event: '*',
            schema: 'public',
            table: 'profiles'
          },
          () => {
            loadUsers();
          }
        )
        .subscribe();

      // Set up real-time subscription for messages
      const messagesChannel = supabase
        .channel('messages_realtime')
        .on(
          'postgres_changes',
          {
            event: 'INSERT',
            schema: 'public',
            table: 'messages'
          },
          (payload) => {
            const newMessage = payload.new as any;
            // Update last message and unread count if message is for current user
            if (newMessage.receiver_id === user.uid) {
              loadUsers();
            }
          }
        )
        .subscribe();

      return () => {
        supabase.removeChannel(profileChannel);
        supabase.removeChannel(messagesChannel);
      };
    }
  }, [user, selectedUserId]);

  const loadUsers = async () => {
    if (!user) return;

    const { data: profiles, error } = await supabase
      .from('profiles')
      .select('id, email, display_name, avatar_url, online_status, last_seen')
      .neq('id', user.uid)
      .order('display_name', { ascending: true });

    if (error) {
      console.error('Error loading users:', error);
      setLoading(false);
      return;
    }

    // Load message data for each user
    const usersWithMessages = await Promise.all(
      (profiles || []).map(async (profile) => {
        // Get unread count
        const { count: unreadCount } = await supabase
          .from('messages')
          .select('*', { count: 'exact', head: true })
          .eq('sender_id', profile.id)
          .eq('receiver_id', user.uid)
          .eq('read', false);

        // Get last message (either sent or received)
        const { data: lastMessages } = await supabase
          .from('messages')
          .select('content, created_at, sender_id, message_type')
          .or(`and(sender_id.eq.${profile.id},receiver_id.eq.${user.uid}),and(sender_id.eq.${user.uid},receiver_id.eq.${profile.id})`)
          .order('created_at', { ascending: false })
          .limit(1);

        return {
          ...profile,
          unreadCount: unreadCount || 0,
          lastMessage: lastMessages?.[0]
        };
      })
    );

    // Sort by: 1) unread messages first, 2) then by last message time, 3) then by name
    usersWithMessages.sort((a, b) => {
      if (a.unreadCount > 0 && b.unreadCount === 0) return -1;
      if (a.unreadCount === 0 && b.unreadCount > 0) return 1;
      
      if (a.lastMessage && b.lastMessage) {
        return new Date(b.lastMessage.created_at).getTime() - new Date(a.lastMessage.created_at).getTime();
      }
      if (a.lastMessage && !b.lastMessage) return -1;
      if (!a.lastMessage && b.lastMessage) return 1;
      
      return a.display_name.localeCompare(b.display_name);
    });

    setUsers(usersWithMessages);
    setLoading(false);
  };

  const formatLastMessage = (msg: LastMessage, senderId: string) => {
    const isOwn = senderId === user?.uid;
    const prefix = isOwn ? 'You: ' : '';
    
    if (msg.message_type === 'file') {
      return `${prefix}📎 File`;
    }
    
    const truncated = msg.content.length > 30 ? msg.content.substring(0, 30) + '...' : msg.content;
    return `${prefix}${truncated}`;
  };

  const formatTime = (timestamp: string) => {
    const date = new Date(timestamp);
    const now = new Date();
    const diff = now.getTime() - date.getTime();
    
    // Less than a minute
    if (diff < 60000) return 'Just now';
    
    // Less than an hour
    if (diff < 3600000) {
      const minutes = Math.floor(diff / 60000);
      return `${minutes}m ago`;
    }
    
    // Today
    if (date.toDateString() === now.toDateString()) {
      return date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
    }
    
    // Yesterday
    const yesterday = new Date(now);
    yesterday.setDate(yesterday.getDate() - 1);
    if (date.toDateString() === yesterday.toDateString()) {
      return 'Yesterday';
    }
    
    // This week
    if (diff < 604800000) {
      return date.toLocaleDateString('en-US', { weekday: 'short' });
    }
    
    // Older
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-violet-500"></div>
      </div>
    );
  }

  return (
    <div className="h-full overflow-y-auto">
      <div className="p-4 border-b border-violet-500/20">
        <h2 className="text-xl font-semibold text-white">Chats</h2>
        <p className="text-sm text-gray-400">{users.length} contacts</p>
      </div>
      <div className="divide-y divide-violet-500/10">
        {users.map((profile) => (
          <button
            key={profile.id}
            onClick={() => onSelectUser(profile.id, profile.display_name)}
            className={`w-full p-4 flex items-start gap-3 hover:bg-violet-500/10 transition-all ${
              selectedUserId === profile.id ? 'bg-violet-500/20' : ''
            } ${profile.unreadCount > 0 ? 'bg-violet-500/5' : ''}`}
          >
            <div className="relative flex-shrink-0">
              <div className="w-12 h-12 rounded-full bg-gradient-to-br from-violet-500 to-purple-600 flex items-center justify-center text-white font-semibold">
                {profile.avatar_url ? (
                  <img
                    src={profile.avatar_url}
                    alt={profile.display_name}
                    className="w-full h-full rounded-full object-cover"
                  />
                ) : (
                  <User size={24} />
                )}
              </div>
              <Circle
                size={12}
                className={`absolute bottom-0 right-0 ${
                  profile.online_status ? 'fill-green-500 text-green-500' : 'fill-gray-500 text-gray-500'
                }`}
              />
            </div>
            <div className="flex-1 min-w-0 text-left">
              <div className="flex items-center justify-between mb-1">
                <p className={`font-medium truncate ${profile.unreadCount > 0 ? 'text-white' : 'text-gray-200'}`}>
                  {profile.display_name}
                </p>
                {profile.lastMessage && (
                  <span className="text-xs text-gray-400 flex-shrink-0 ml-2">
                    {formatTime(profile.lastMessage.created_at)}
                  </span>
                )}
              </div>
              <div className="flex items-center justify-between gap-2">
                {profile.lastMessage ? (
                  <p className={`text-sm truncate ${profile.unreadCount > 0 ? 'text-white font-medium' : 'text-gray-400'}`}>
                    {formatLastMessage(profile.lastMessage, profile.lastMessage.sender_id)}
                  </p>
                ) : (
                  <p className="text-sm text-gray-500 italic">No messages yet</p>
                )}
                {profile.unreadCount > 0 && (
                  <span className="bg-violet-600 text-white text-xs font-bold rounded-full min-w-[20px] h-5 flex items-center justify-center px-1.5 flex-shrink-0">
                    {profile.unreadCount > 99 ? '99+' : profile.unreadCount}
                  </span>
                )}
              </div>
            </div>
          </button>
        ))}
        {users.length === 0 && (
          <div className="p-8 text-center text-gray-400">
            <User size={48} className="mx-auto mb-4 opacity-50" />
            <p>No contacts yet</p>
          </div>
        )}
      </div>
    </div>
  );
};