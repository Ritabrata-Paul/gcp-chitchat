import { useState, useEffect } from 'react';
import { supabase } from '../../config/supabase';
import { useAuth } from '../../contexts/AuthContext';
import { X, UserPlus, Check } from 'lucide-react';

interface Profile {
  id: string;
  display_name: string;
  email: string;
  avatar_url?: string;
}

interface CreateGroupProps {
  onClose: () => void;
  onGroupCreated: () => void;
}

export const CreateGroup = ({ onClose, onGroupCreated }: CreateGroupProps) => {
  const { user } = useAuth();
  const [groupName, setGroupName] = useState('');
  const [description, setDescription] = useState('');
  const [users, setUsers] = useState<Profile[]>([]);
  const [selectedUsers, setSelectedUsers] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(false);
  const [loadingUsers, setLoadingUsers] = useState(true);

  useEffect(() => {
    loadUsers();
  }, [user]);

  const loadUsers = async () => {
    if (!user) return;

    const { data, error } = await supabase
      .from('profiles')
      .select('id, display_name, email, avatar_url')
      .neq('id', user.uid)
      .order('display_name', { ascending: true });

    if (error) {
      console.error('Error loading users:', error);
    } else {
      setUsers(data || []);
    }
    setLoadingUsers(false);
  };

  const toggleUserSelection = (userId: string) => {
    const newSelected = new Set(selectedUsers);
    if (newSelected.has(userId)) {
      newSelected.delete(userId);
    } else {
      newSelected.add(userId);
    }
    setSelectedUsers(newSelected);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || selectedUsers.size === 0) {
      alert('Please select at least one member');
      return;
    }

    setLoading(true);

    try {
      // Create group
      const { data: groupData, error: groupError } = await supabase
        .from('groups')
        .insert({
          name: groupName,
          description: description,
          created_by: user.uid
        })
        .select()
        .single();

      if (groupError) throw groupError;

      // Add creator as admin
      await supabase.from('group_members').insert({
        group_id: groupData.id,
        user_id: user.uid,
        role: 'admin'
      });

      // Add selected members
      const memberInserts = Array.from(selectedUsers).map(userId => ({
        group_id: groupData.id,
        user_id: userId,
        role: 'member'
      }));

      const { error: membersError } = await supabase
        .from('group_members')
        .insert(memberInserts);

      if (membersError) throw membersError;

      alert('Group created successfully!');
      onGroupCreated();
      onClose();
    } catch (error) {
      console.error('Error creating group:', error);
      alert('Failed to create group');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-gray-800/90 backdrop-blur-lg rounded-2xl shadow-2xl p-8 border border-violet-500/20 max-w-2xl w-full max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-2xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-violet-400 to-purple-600">
            Create Group
          </h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-white transition-colors"
          >
            <X size={24} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Group Name */}
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-2">
              Group Name
            </label>
            <input
              type="text"
              value={groupName}
              onChange={(e) => setGroupName(e.target.value)}
              className="w-full px-4 py-3 bg-gray-900/50 border border-violet-500/30 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:border-violet-500 focus:ring-2 focus:ring-violet-500/20 transition-all"
              placeholder="Enter group name"
              required
            />
          </div>

          {/* Description */}
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-2">
              Description (Optional)
            </label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
              className="w-full px-4 py-3 bg-gray-900/50 border border-violet-500/30 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:border-violet-500 focus:ring-2 focus:ring-violet-500/20 transition-all resize-none"
              placeholder="What's this group about?"
            />
          </div>

          {/* Select Members */}
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-2">
              Add Members ({selectedUsers.size} selected)
            </label>
            <div className="bg-gray-900/50 border border-violet-500/30 rounded-lg max-h-64 overflow-y-auto">
              {loadingUsers ? (
                <div className="p-8 text-center">
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-violet-500 mx-auto"></div>
                </div>
              ) : users.length === 0 ? (
                <div className="p-8 text-center text-gray-400">
                  No users available
                </div>
              ) : (
                <div className="divide-y divide-violet-500/10">
                  {users.map((profile) => (
                    <button
                      key={profile.id}
                      type="button"
                      onClick={() => toggleUserSelection(profile.id)}
                      className={`w-full p-3 flex items-center gap-3 hover:bg-violet-500/10 transition-all ${
                        selectedUsers.has(profile.id) ? 'bg-violet-500/20' : ''
                      }`}
                    >
                      <div className="w-10 h-10 rounded-full bg-gradient-to-br from-violet-500 to-purple-600 flex items-center justify-center text-white font-semibold flex-shrink-0">
                        {profile.avatar_url ? (
                          <img
                            src={profile.avatar_url}
                            alt={profile.display_name}
                            className="w-full h-full rounded-full object-cover"
                          />
                        ) : (
                          profile.display_name.charAt(0).toUpperCase()
                        )}
                      </div>
                      <div className="flex-1 text-left">
                        <p className="font-medium text-white">{profile.display_name}</p>
                        <p className="text-sm text-gray-400 truncate">{profile.email}</p>
                      </div>
                      {selectedUsers.has(profile.id) && (
                        <Check size={20} className="text-green-500 flex-shrink-0" />
                      )}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Submit Button */}
          <button
            type="submit"
            disabled={loading || selectedUsers.size === 0}
            className="w-full bg-gradient-to-r from-violet-600 to-purple-600 text-white py-3 rounded-lg font-medium hover:from-violet-700 hover:to-purple-700 focus:outline-none focus:ring-2 focus:ring-violet-500 focus:ring-offset-2 focus:ring-offset-gray-900 transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
          >
            <UserPlus size={20} />
            {loading ? 'Creating...' : 'Create Group'}
          </button>
        </form>
      </div>
    </div>
  );
};