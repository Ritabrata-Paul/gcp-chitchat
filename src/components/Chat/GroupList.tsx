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
  member_count?: number;
}

interface GroupListProps {
  selectedGroupId: string | null;
  onSelectGroup: (groupId: string, groupName: string) => void;
  onCreateGroup: () => void;
}

export const GroupList = ({ selectedGroupId, onSelectGroup, onCreateGroup }: GroupListProps) => {
  const [groups, setGroups] = useState<Group[]>([]);
  const [loading, setLoading] = useState(true);
  const { user } = useAuth();

  useEffect(() => {
    if (user) {
      loadGroups();
      
      // Set up real-time subscription
      const channel = supabase
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

      return () => {
        supabase.removeChannel(channel);
      };
    }
  }, [user]);

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
      .in('id', groupIds)
      .order('created_at', { ascending: false });

    if (groupError) {
      console.error('Error loading groups:', groupError);
    } else {
      // Get member counts for each group
      const groupsWithCounts = await Promise.all(
        (groupData || []).map(async (group) => {
          const { count } = await supabase
            .from('group_members')
            .select('*', { count: 'exact', head: true })
            .eq('group_id', group.id);
          
          return {
            ...group,
            member_count: count || 0
          };
        })
      );
      
      setGroups(groupsWithCounts);
    }
    setLoading(false);
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
            className={`w-full p-4 flex items-center gap-3 hover:bg-violet-500/10 transition-all ${
              selectedGroupId === group.id ? 'bg-violet-500/20' : ''
            }`}
          >
            <div className="w-12 h-12 rounded-full bg-gradient-to-br from-violet-500 to-purple-600 flex items-center justify-center text-white font-semibold">
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
            <div className="flex-1 text-left">
              <p className="font-medium text-white">{group.name}</p>
              <p className="text-sm text-gray-400 truncate">
                {group.member_count} members
              </p>
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