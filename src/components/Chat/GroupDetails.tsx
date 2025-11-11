import { useState, useEffect } from 'react';
import { supabase } from '../../config/supabase';
import { useAuth } from '../../contexts/AuthContext';
import { X, Edit2, UserPlus, Save, Trash2, Camera, Users, Crown, Shield } from 'lucide-react';
import { ref as storageRef, uploadBytesResumable, getDownloadURL } from 'firebase/storage';
import { storage } from '../../config/firebase';

interface GroupMember {
  id: string;
  user_id: string;
  role: string;
  display_name: string;
  email: string;
  avatar_url?: string;
  online_status: boolean;
}

interface Profile {
  id: string;
  display_name: string;
  email: string;
  avatar_url?: string;
}

interface GroupDetailsProps {
  groupId: string;
  groupName: string;
  onClose: () => void;
  onGroupUpdated: () => void;
}

export const GroupDetails = ({ groupId, groupName, onClose, onGroupUpdated }: GroupDetailsProps) => {
  const { user } = useAuth();
  const [group, setGroup] = useState<any>(null);
  const [members, setMembers] = useState<GroupMember[]>([]);
  const [allUsers, setAllUsers] = useState<Profile[]>([]);
  const [isAdmin, setIsAdmin] = useState(false);
  const [loading, setLoading] = useState(true);
  const [editMode, setEditMode] = useState(false);
  const [addMemberMode, setAddMemberMode] = useState(false);
  const [selectedNewMembers, setSelectedNewMembers] = useState<Set<string>>(new Set());
  
  // Edit fields
  const [newGroupName, setNewGroupName] = useState('');
  const [newDescription, setNewDescription] = useState('');
  const [newAvatarFile, setNewAvatarFile] = useState<File | null>(null);
  const [avatarPreview, setAvatarPreview] = useState('');
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);

  useEffect(() => {
    loadGroupDetails();
    loadMembers();
    checkAdminStatus();
  }, [groupId, user]);

  useEffect(() => {
    if (addMemberMode) {
      loadAvailableUsers();
    }
  }, [addMemberMode]);

  const loadGroupDetails = async () => {
    const { data, error } = await supabase
      .from('groups')
      .select('*')
      .eq('id', groupId)
      .single();

    if (error) {
      console.error('Error loading group:', error);
    } else {
      setGroup(data);
      setNewGroupName(data.name);
      setNewDescription(data.description || '');
      setAvatarPreview(data.avatar_url || '');
    }
  };

  const loadMembers = async () => {
    const { data, error } = await supabase
      .from('group_members')
      .select('id, user_id, role')
      .eq('group_id', groupId);

    if (error) {
      console.error('Error loading members:', error);
      setLoading(false);
      return;
    }

    // Load profile info for each member
    const membersWithProfiles = await Promise.all(
      (data || []).map(async (member) => {
        const { data: profile } = await supabase
          .from('profiles')
          .select('display_name, email, avatar_url, online_status')
          .eq('id', member.user_id)
          .single();

        return {
          ...member,
          display_name: profile?.display_name || 'Unknown',
          email: profile?.email || '',
          avatar_url: profile?.avatar_url,
          online_status: profile?.online_status || false
        };
      })
    );

    setMembers(membersWithProfiles);
    setLoading(false);
  };

  const loadAvailableUsers = async () => {
    if (!user) return;

    // Get all users
    const { data: allProfiles } = await supabase
      .from('profiles')
      .select('id, display_name, email, avatar_url')
      .neq('id', user.uid)
      .order('display_name', { ascending: true });

    // Filter out users who are already members
    const memberIds = new Set(members.map(m => m.user_id));
    const available = (allProfiles || []).filter(p => !memberIds.has(p.id));

    setAllUsers(available);
  };

  const checkAdminStatus = async () => {
    if (!user) return;

    const { data } = await supabase
      .from('group_members')
      .select('role')
      .eq('group_id', groupId)
      .eq('user_id', user.uid)
      .single();

    setIsAdmin(data?.role === 'admin');
  };

  const handleAvatarSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      if (file.size > 5 * 1024 * 1024) {
        alert('Image size must be less than 5MB');
        return;
      }
      setNewAvatarFile(file);
      const reader = new FileReader();
      reader.onloadend = () => {
        setAvatarPreview(reader.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  const uploadAvatar = async (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const fileRef = storageRef(storage, `group_avatars/${groupId}/${Date.now()}_${file.name}`);
      const uploadTask = uploadBytesResumable(fileRef, file);

      uploadTask.on(
        'state_changed',
        (snapshot) => {
          const progress = (snapshot.bytesTransferred / snapshot.totalBytes) * 100;
          setUploadProgress(progress);
        },
        (error) => reject(error),
        async () => {
          const downloadURL = await getDownloadURL(uploadTask.snapshot.ref);
          resolve(downloadURL);
        }
      );
    });
  };

  const handleSaveChanges = async () => {
    if (!newGroupName.trim()) {
      alert('Group name is required');
      return;
    }

    setUploading(true);
    try {
      let avatarUrl = group.avatar_url;

      if (newAvatarFile) {
        avatarUrl = await uploadAvatar(newAvatarFile);
      }

      const { error } = await supabase
        .from('groups')
        .update({
          name: newGroupName,
          description: newDescription,
          avatar_url: avatarUrl
        })
        .eq('id', groupId);

      if (error) throw error;

      alert('Group updated successfully!');
      setEditMode(false);
      setNewAvatarFile(null);
      loadGroupDetails();
      onGroupUpdated();
    } catch (error) {
      console.error('Error updating group:', error);
      alert('Failed to update group');
    } finally {
      setUploading(false);
      setUploadProgress(0);
    }
  };

  const handleAddMembers = async () => {
    if (selectedNewMembers.size === 0) {
      alert('Please select at least one member');
      return;
    }

    try {
      const memberInserts = Array.from(selectedNewMembers).map(userId => ({
        group_id: groupId,
        user_id: userId,
        role: 'member'
      }));

      const { error } = await supabase
        .from('group_members')
        .insert(memberInserts);

      if (error) throw error;

      alert('Members added successfully!');
      setAddMemberMode(false);
      setSelectedNewMembers(new Set());
      loadMembers();
      onGroupUpdated();
    } catch (error) {
      console.error('Error adding members:', error);
      alert('Failed to add members');
    }
  };

  const handleRemoveMember = async (memberId: string, memberUserId: string) => {
    if (!confirm('Are you sure you want to remove this member?')) return;

    // Prevent removing yourself if you're the last admin
    if (memberUserId === user?.uid) {
      const adminCount = members.filter(m => m.role === 'admin').length;
      if (adminCount === 1) {
        alert('Cannot remove the last admin. Please assign another admin first.');
        return;
      }
    }

    try {
      const { error } = await supabase
        .from('group_members')
        .delete()
        .eq('id', memberId);

      if (error) throw error;

      alert('Member removed successfully!');
      loadMembers();
      onGroupUpdated();
    } catch (error) {
      console.error('Error removing member:', error);
      alert('Failed to remove member');
    }
  };

  const handleToggleRole = async (memberId: string, currentRole: string, memberUserId: string) => {
    const newRole = currentRole === 'admin' ? 'member' : 'admin';

    // Prevent demoting yourself if you're the last admin
    if (newRole === 'member' && memberUserId === user?.uid) {
      const adminCount = members.filter(m => m.role === 'admin').length;
      if (adminCount === 1) {
        alert('Cannot demote the last admin. Please assign another admin first.');
        return;
      }
    }

    try {
      const { error } = await supabase
        .from('group_members')
        .update({ role: newRole })
        .eq('id', memberId);

      if (error) throw error;

      loadMembers();
    } catch (error) {
      console.error('Error updating role:', error);
      alert('Failed to update role');
    }
  };

  const toggleNewMemberSelection = (userId: string) => {
    const newSelected = new Set(selectedNewMembers);
    if (newSelected.has(userId)) {
      newSelected.delete(userId);
    } else {
      newSelected.add(userId);
    }
    setSelectedNewMembers(newSelected);
  };

  if (loading) {
    return (
      <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-violet-500"></div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-gray-800/90 backdrop-blur-lg rounded-2xl shadow-2xl border border-violet-500/20 max-w-2xl w-full max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="sticky top-0 bg-gray-800/95 backdrop-blur-lg p-6 border-b border-violet-500/20 flex items-center justify-between">
          <h2 className="text-2xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-violet-400 to-purple-600">
            {editMode ? 'Edit Group' : 'Group Details'}
          </h2>
          <button onClick={onClose} className="text-gray-400 hover:text-white transition-colors">
            <X size={24} />
          </button>
        </div>

        <div className="p-6 space-y-6">
          {/* Group Info */}
          <div className="flex flex-col items-center space-y-4">
            <div className="relative">
              <div className="w-32 h-32 rounded-full bg-gradient-to-br from-violet-500 to-purple-600 flex items-center justify-center overflow-hidden">
                {avatarPreview ? (
                  <img src={avatarPreview} alt={newGroupName} className="w-full h-full object-cover" />
                ) : (
                  <Users size={48} className="text-white" />
                )}
              </div>
              {editMode && (
                <label className="absolute bottom-0 right-0 p-2 bg-violet-600 rounded-full hover:bg-violet-700 transition-colors cursor-pointer">
                  <Camera size={20} className="text-white" />
                  <input
                    type="file"
                    className="hidden"
                    accept="image/*"
                    onChange={handleAvatarSelect}
                  />
                </label>
              )}
            </div>

            {uploading && uploadProgress > 0 && (
              <div className="w-full max-w-xs">
                <div className="w-full bg-gray-700 rounded-full h-2">
                  <div
                    className="bg-gradient-to-r from-violet-600 to-purple-600 h-2 rounded-full transition-all"
                    style={{ width: `${uploadProgress}%` }}
                  />
                </div>
                <p className="text-xs text-gray-400 mt-1 text-center">
                  Uploading... {Math.round(uploadProgress)}%
                </p>
              </div>
            )}

            {editMode ? (
              <div className="w-full space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-2">Group Name</label>
                  <input
                    type="text"
                    value={newGroupName}
                    onChange={(e) => setNewGroupName(e.target.value)}
                    className="w-full px-4 py-3 bg-gray-900/50 border border-violet-500/30 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:border-violet-500 focus:ring-2 focus:ring-violet-500/20 transition-all"
                    placeholder="Group name"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-2">Description</label>
                  <textarea
                    value={newDescription}
                    onChange={(e) => setNewDescription(e.target.value)}
                    rows={3}
                    className="w-full px-4 py-3 bg-gray-900/50 border border-violet-500/30 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:border-violet-500 focus:ring-2 focus:ring-violet-500/20 transition-all resize-none"
                    placeholder="Group description"
                  />
                </div>
              </div>
            ) : (
              <>
                <h3 className="text-2xl font-bold text-white">{group?.name}</h3>
                {group?.description && (
                  <p className="text-gray-400 text-center max-w-md">{group.description}</p>
                )}
                <p className="text-sm text-gray-500">{members.length} members</p>
              </>
            )}
          </div>

          {/* Action Buttons */}
          {isAdmin && (
            <div className="flex gap-2">
              {editMode ? (
                <>
                  <button
                    onClick={handleSaveChanges}
                    disabled={uploading}
                    className="flex-1 bg-gradient-to-r from-violet-600 to-purple-600 text-white py-3 rounded-lg font-medium hover:from-violet-700 hover:to-purple-700 transition-all disabled:opacity-50 flex items-center justify-center gap-2"
                  >
                    <Save size={20} />
                    Save Changes
                  </button>
                  <button
                    onClick={() => {
                      setEditMode(false);
                      setNewGroupName(group.name);
                      setNewDescription(group.description || '');
                      setAvatarPreview(group.avatar_url || '');
                      setNewAvatarFile(null);
                    }}
                    className="px-6 py-3 bg-gray-700 text-white rounded-lg font-medium hover:bg-gray-600 transition-all"
                  >
                    Cancel
                  </button>
                </>
              ) : (
                <>
                  <button
                    onClick={() => setEditMode(true)}
                    className="flex-1 bg-gradient-to-r from-violet-600 to-purple-600 text-white py-3 rounded-lg font-medium hover:from-violet-700 hover:to-purple-700 transition-all flex items-center justify-center gap-2"
                  >
                    <Edit2 size={20} />
                    Edit Group
                  </button>
                  <button
                    onClick={() => setAddMemberMode(!addMemberMode)}
                    className="flex-1 bg-gray-700 text-white py-3 rounded-lg font-medium hover:bg-gray-600 transition-all flex items-center justify-center gap-2"
                  >
                    <UserPlus size={20} />
                    Add Members
                  </button>
                </>
              )}
            </div>
          )}

          {/* Add Members Section */}
          {addMemberMode && (
            <div className="bg-gray-900/50 border border-violet-500/30 rounded-lg p-4">
              <h4 className="text-lg font-semibold text-white mb-4">
                Add New Members ({selectedNewMembers.size} selected)
              </h4>
              <div className="max-h-64 overflow-y-auto mb-4 space-y-2">
                {allUsers.length === 0 ? (
                  <p className="text-gray-400 text-center py-4">No available users to add</p>
                ) : (
                  allUsers.map((profile) => (
                    <button
                      key={profile.id}
                      onClick={() => toggleNewMemberSelection(profile.id)}
                      className={`w-full p-3 flex items-center gap-3 rounded-lg transition-all ${
                        selectedNewMembers.has(profile.id)
                          ? 'bg-violet-500/20 border border-violet-500/50'
                          : 'bg-gray-800/50 hover:bg-gray-700/50'
                      }`}
                    >
                      <div className="w-10 h-10 rounded-full bg-gradient-to-br from-violet-500 to-purple-600 flex items-center justify-center text-white font-semibold">
                        {profile.avatar_url ? (
                          <img src={profile.avatar_url} alt={profile.display_name} className="w-full h-full rounded-full object-cover" />
                        ) : (
                          profile.display_name.charAt(0).toUpperCase()
                        )}
                      </div>
                      <div className="flex-1 text-left">
                        <p className="font-medium text-white">{profile.display_name}</p>
                        <p className="text-sm text-gray-400">{profile.email}</p>
                      </div>
                      {selectedNewMembers.has(profile.id) && (
                        <div className="w-6 h-6 bg-violet-600 rounded-full flex items-center justify-center">
                          <svg className="w-4 h-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                          </svg>
                        </div>
                      )}
                    </button>
                  ))
                )}
              </div>
              <div className="flex gap-2">
                <button
                  onClick={handleAddMembers}
                  disabled={selectedNewMembers.size === 0}
                  className="flex-1 bg-gradient-to-r from-violet-600 to-purple-600 text-white py-2 rounded-lg font-medium hover:from-violet-700 hover:to-purple-700 transition-all disabled:opacity-50"
                >
                  Add Selected
                </button>
                <button
                  onClick={() => {
                    setAddMemberMode(false);
                    setSelectedNewMembers(new Set());
                  }}
                  className="px-6 py-2 bg-gray-700 text-white rounded-lg font-medium hover:bg-gray-600 transition-all"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}

          {/* Members List */}
          <div>
            <h4 className="text-lg font-semibold text-white mb-4">Members</h4>
            <div className="space-y-2">
              {members.map((member) => (
                <div
                  key={member.id}
                  className="flex items-center gap-3 p-3 bg-gray-900/50 rounded-lg hover:bg-gray-800/50 transition-all"
                >
                  <div className="relative">
                    <div className="w-12 h-12 rounded-full bg-gradient-to-br from-violet-500 to-purple-600 flex items-center justify-center text-white font-semibold">
                      {member.avatar_url ? (
                        <img src={member.avatar_url} alt={member.display_name} className="w-full h-full rounded-full object-cover" />
                      ) : (
                        member.display_name.charAt(0).toUpperCase()
                      )}
                    </div>
                    <div
                      className={`absolute bottom-0 right-0 w-3 h-3 rounded-full border-2 border-gray-800 ${
                        member.online_status ? 'bg-green-500' : 'bg-gray-500'
                      }`}
                    />
                  </div>
                  <div className="flex-1">
                    <p className="font-medium text-white flex items-center gap-2">
                      {member.display_name}
                      {member.role === 'admin' && (
                        <Crown size={16} className="text-yellow-500" />
                      )}
                      {member.user_id === user?.uid && (
                        <span className="text-xs text-violet-400">(You)</span>
                      )}
                    </p>
                    <p className="text-sm text-gray-400">{member.email}</p>
                  </div>
                  {isAdmin && member.user_id !== group?.created_by && (
                    <div className="flex gap-2">
                      <button
                        onClick={() => handleToggleRole(member.id, member.role, member.user_id)}
                        className={`p-2 rounded-lg transition-all ${
                          member.role === 'admin'
                            ? 'bg-yellow-500/20 text-yellow-500 hover:bg-yellow-500/30'
                            : 'bg-gray-700 text-gray-400 hover:bg-gray-600'
                        }`}
                        title={member.role === 'admin' ? 'Demote to member' : 'Promote to admin'}
                      >
                        <Shield size={16} />
                      </button>
                      <button
                        onClick={() => handleRemoveMember(member.id, member.user_id)}
                        className="p-2 bg-red-500/20 text-red-500 rounded-lg hover:bg-red-500/30 transition-all"
                        title="Remove member"
                      >
                        <Trash2 size={16} />
                      </button>
                    </div>
                  )}
                  {member.user_id === group?.created_by && (
                    <span className="text-xs text-gray-500 italic">Creator</span>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};