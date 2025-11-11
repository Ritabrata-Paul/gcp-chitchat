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

interface UserListProps {
  selectedUserId: string | null;
  onSelectUser: (userId: string, displayName: string) => void;
}

export const UserList = ({ selectedUserId, onSelectUser }: UserListProps) => {
  const [users, setUsers] = useState<Profile[]>([]);
  const [loading, setLoading] = useState(true);
  const { user } = useAuth();

  useEffect(() => {
    if (user) {
      loadUsers();
      
      // Set up real-time subscription for new users and updates
      const channel = supabase
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

      return () => {
        supabase.removeChannel(channel);
      };
    }
  }, [user]);

  const loadUsers = async () => {
    if (!user) return;

    const { data, error } = await supabase
      .from('profiles')
      .select('id, email, display_name, avatar_url, online_status, last_seen')
      .neq('id', user.uid)
      .order('display_name', { ascending: true });

    if (error) console.error('Error loading users:', error);
    else setUsers(data || []);
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
      <div className="p-4 border-b border-violet-500/20">
        <h2 className="text-xl font-semibold text-white">Users</h2>
        <p className="text-sm text-gray-400">{users.length} users</p>
      </div>
      <div className="divide-y divide-violet-500/10">
        {users.map((profile) => (
          <button
            key={profile.id}
            onClick={() => onSelectUser(profile.id, profile.display_name)}
            className={`w-full p-4 flex items-center gap-3 hover:bg-violet-500/10 transition-all ${
              selectedUserId === profile.id ? 'bg-violet-500/20' : ''
            }`}
          >
            <div className="relative">
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
            <div className="flex-1 text-left">
              <p className="font-medium text-white">{profile.display_name}</p>
              <p className="text-sm text-gray-400 truncate">{profile.email}</p>
            </div>
          </button>
        ))}
        {users.length === 0 && (
          <div className="p-8 text-center text-gray-400">
            <User size={48} className="mx-auto mb-4 opacity-50" />
            <p>No other users yet</p>
          </div>
        )}
      </div>
    </div>
  );
};