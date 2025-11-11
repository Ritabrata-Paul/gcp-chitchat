import { useEffect, useState } from 'react';
import { supabase } from '../../config/supabase';
import { useAuth } from '../../contexts/AuthContext';
import { Users, Plus } from 'lucide-react';

interface Group {
  id: string;
  name: string;
  description: string;
  avatar_url?: string;
  created_by: string;
  created_at: string;
}

interface LastMessage {
  content: string;
  created_at: string;
  sender_id: string;
  message_type: string;
  sender_name?: string;
}

interface GroupWithMessages extends Group {
  member_count: number;
  unreadCount: number;
  lastMessage?: LastMessage;
}

interface GroupListProps {
  selectedGroupId: string | null;
  onSelectGroup: (groupId: string, groupName: string) => void;
  onCreateGroup: () => void;
}

export const GroupList = ({ selectedGroupId, onSelectGroup, onCreateGroup }: GroupListProps) => {
  const [groups, setGroups] = useState<GroupWithMessages[]>([]);
  const [loading, setLoading] = useState(true);
  const { user } = useAuth();

  useEffect(() => {
    if (user) {
      loadGroups();
      
      // Set up real-time subscription for groups
      const groupChannel = supabase
        .channel('groups_realtime')
        .on(
          'postgres_changes',
          {
            event: '*',
            schema: 'public',
            table: 'groups'
          },
          () => {
            loadGroups();
          }
        )
        .subscribe();

      // Set up real-time subscription for group members
      const memberChannel = supabase
        .channel('group_members_realtime')
        .on(
          'postgres_changes',
          {
            event: '*',
            schema: 'public',
            table: 'group_members'
          },
          () => {
            loadGroups();
          }
        )
        .subscribe();

      // Set up real-time subscription for group messages
      const messagesChannel = supabase
        .channel('group_messages_realtime')
        .on(
          'postgres_changes',
          {
            event: 'INSERT',
            schema: 'public',
            table: 'group_messages'
          },
          () => {
            loadGroups();
          }
        )
        .subscribe();

      return () => {
        supabase.removeChannel(groupChannel);
        supabase.removeChannel(memberChannel);
        supabase.removeChannel(messagesChannel);
      };
    }
  }, [user, selectedGroupId]);

  const loadGroups = async () => {
    if (!user) return;

    // Get groups where user is a member
    const { data: memberData, error: memberError } = await supabase
      .from('group_members')
      .select('group_id')
      .eq('user_id', user.uid);

    if (memberError) {
      console.error('Error loading group members:', memberError);
      setLoading(false);
      return;
    }

    const groupIds = memberData.map(m => m.group_id);

    if (groupIds.length === 0) {
      setGroups([]);
      setLoading(false);
      return;
    }

    // Get group details
    const { data: groupData, error: groupError } = await supabase
      .from('groups')
      .select('*')
      .in('id', groupIds);

    if (groupError) {
      console.error('Error loading groups:', groupError);
      setLoading(false);
      return;
    }

    // Get additional data for each group
    const groupsWithData = await Promise.all(
      (groupData || []).map(async (group) => {
        // Get member count
        const { count: memberCount } = await supabase
          .from('group_members')
          .select('*', { count: 'exact', head: true })
          .eq('group_id', group.id);

        // Get last message with sender info
        const { data: lastMessages } = await supabase
          .from('group_messages')
          .select('content, created_at, sender_id, message_type')
          .eq('group_id', group.id)
          .order('created_at', { ascending: false })
          .limit(1);

        let lastMessage = lastMessages?.[0];
        
        // Get sender name if last message exists
        if (lastMessage) {
          const { data: senderData } = await supabase
            .from('profiles')
            .select('display_name')
            .eq('id', lastMessage.sender_id)
            .single();
          
          lastMessage = {
            ...lastMessage,
            sender_name: senderData?.display_name
          };
        }

        // Get unread count (messages sent after user's last read)
        // For simplicity, we'll count all messages sent by others that are newer than user's last view
        const { data: userLastSeen } = await supabase
          .from('group_members')
          .select('last_read_at')
          .eq('group_id', group.id)
          .eq('user_id', user.uid)
          .single();

        let unreadCount = 0;
        if (userLastSeen?.last_read_at) {
          const { count } = await supabase
            .from('group_messages')
            .select('*', { count: 'exact', head: true })
            .eq('group_id', group.id)
            .neq('sender_id', user.uid)
            .gt('created_at', userLastSeen.last_read_at);
          
          unreadCount = count || 0;
        } else {
          // If never read, count all messages from others
          const { count } = await supabase
            .from('group_messages')
            .select('*', { count: 'exact', head: true })
            .eq('group_id', group.id)
            .neq('sender_id', user.uid);
          
          unreadCount = count || 0;
        }

        return {
          ...group,
          member_count: memberCount || 0,
          unreadCount,
          lastMessage
        };
      })
    );

    // Sort groups: 1) unread first, 2) then by last message time, 3) then by creation time
    groupsWithData.sort((a, b) => {
      if (a.unreadCount > 0 && b.unreadCount === 0) return -1;
      if (a.unreadCount === 0 && b.unreadCount > 0) return 1;
      
      if (a.lastMessage && b.lastMessage) {
        return new Date(b.lastMessage.created_at).getTime() - new Date(a.lastMessage.created_at).getTime();
      }
      if (a.lastMessage && !b.lastMessage) return -1;
      if (!a.lastMessage && b.lastMessage) return 1;
      
      return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
    });

    setGroups(groupsWithData);
    setLoading(false);
  };

  const formatLastMessage = (msg: LastMessage, senderId: string) => {
    const isOwn = senderId === user?.uid;
    const senderPrefix = isOwn ? 'You: ' : `${msg.sender_name}: `;
    
    if (msg.message_type === 'file') {
      return `${senderPrefix}📎 File`;
    }
    
    const truncated = msg.content.length > 25 ? msg.content.substring(0, 25) + '...' : msg.content;
    return `${senderPrefix}${truncated}`;
  };

  const formatTime = (timestamp: string) => {
    const date = new Date(timestamp);
    const now = new Date();
    const diff = now.getTime() - date.getTime();
    
    if (diff < 60000) return 'Just now';
    
    if (diff < 3600000) {
      const minutes = Math.floor(diff / 60000);
      return `${minutes}m ago`;
    }
    
    if (date.toDateString() === now.toDateString()) {
      return date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
    }
    
    const yesterday = new Date(now);
    yesterday.setDate(yesterday.getDate() - 1);
    if (date.toDateString() === yesterday.toDateString()) {
      return 'Yesterday';
    }
    
    if (diff < 604800000) {
      return date.toLocaleDateString('en-US', { weekday: 'short' });
    }
    
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
      <div className="p-4 border-b border-violet-500/20 flex items-center justify-between">
        <div>
          <h2 className="text-xl font-semibold text-white">Groups</h2>
          <p className="text-sm text-gray-400">{groups.length} groups</p>
        </div>
        <button
          onClick={onCreateGroup}
          className="p-2 bg-gradient-to-r from-violet-600 to-purple-600 rounded-lg hover:from-violet-700 hover:to-purple-700 transition-all"
          title="Create Group"
        >
          <Plus size={20} className="text-white" />
        </button>
      </div>
      <div className="divide-y divide-violet-500/10">
        {groups.map((group) => (
          <button
            key={group.id}
            onClick={() => onSelectGroup(group.id, group.name)}
            className={`w-full p-4 flex items-start gap-3 hover:bg-violet-500/10 transition-all ${
              selectedGroupId === group.id ? 'bg-violet-500/20' : ''
            } ${group.unreadCount > 0 ? 'bg-violet-500/5' : ''}`}
          >
            <div className="w-12 h-12 rounded-full bg-gradient-to-br from-violet-500 to-purple-600 flex items-center justify-center text-white font-semibold flex-shrink-0">
              {group.avatar_url ? (
                <img
                  src={group.avatar_url}
                  alt={group.name}
                  className="w-full h-full rounded-full object-cover"
                />
              ) : (
                <Users size={24} />
              )}
            </div>
            <div className="flex-1 min-w-0 text-left">
              <div className="flex items-center justify-between mb-1">
                <p className={`font-medium truncate ${group.unreadCount > 0 ? 'text-white' : 'text-gray-200'}`}>
                  {group.name}
                </p>
                {group.lastMessage && (
                  <span className="text-xs text-gray-400 flex-shrink-0 ml-2">
                    {formatTime(group.lastMessage.created_at)}
                  </span>
                )}
              </div>
              <div className="flex items-center justify-between gap-2">
                {group.lastMessage ? (
                  <p className={`text-sm truncate ${group.unreadCount > 0 ? 'text-white font-medium' : 'text-gray-400'}`}>
                    {formatLastMessage(group.lastMessage, group.lastMessage.sender_id)}
                  </p>
                ) : (
                  <p className="text-sm text-gray-500 italic">{group.member_count} members</p>
                )}
                {group.unreadCount > 0 && (
                  <span className="bg-violet-600 text-white text-xs font-bold rounded-full min-w-[20px] h-5 flex items-center justify-center px-1.5 flex-shrink-0">
                    {group.unreadCount > 99 ? '99+' : group.unreadCount}
                  </span>
                )}
              </div>
            </div>
          </button>
        ))}
        {groups.length === 0 && (
          <div className="p-8 text-center text-gray-400">
            <Users size={48} className="mx-auto mb-4 opacity-50" />
            <p>No groups yet</p>
            <button
              onClick={onCreateGroup}
              className="mt-4 px-4 py-2 bg-violet-600 text-white rounded-lg hover:bg-violet-700 transition-colors"
            >
              Create Your First Group
            </button>
          </div>
        )}
      </div>
    </div>
  );
};