import { useState } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { UserList } from './UserList';
import { ChatWindow } from './ChatWindow';
import { GroupList } from './GroupList';
import { GroupChatWindow } from './GroupChatWindow';
import { Profile } from './Profile';
import { CreateGroup } from './CreateGroup';
import { LogOut, User, Users, MessageSquare } from 'lucide-react';

export const ChatPage = () => {
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);
  const [selectedUserName, setSelectedUserName] = useState('');
  const [selectedGroupId, setSelectedGroupId] = useState<string | null>(null);
  const [selectedGroupName, setSelectedGroupName] = useState('');
  const [showProfile, setShowProfile] = useState(false);
  const [showCreateGroup, setShowCreateGroup] = useState(false);
  const [activeTab, setActiveTab] = useState<'users' | 'groups'>('users');
  const { signOut } = useAuth();

  const handleSelectUser = (userId: string, displayName: string) => {
    setSelectedUserId(userId);
    setSelectedUserName(displayName);
    setSelectedGroupId(null);
    setActiveTab('users');
  };

  const handleSelectGroup = (groupId: string, groupName: string) => {
    setSelectedGroupId(groupId);
    setSelectedGroupName(groupName);
    setSelectedUserId(null);
    setActiveTab('groups');
  };

  const handleGroupCreated = () => {
    // Refresh will happen automatically due to real-time subscription
    setActiveTab('groups');
  };

  return (
    <div className="h-screen flex flex-col bg-gradient-to-br from-gray-900 via-violet-900 to-black">
      <header className="bg-gray-800/50 backdrop-blur-lg border-b border-violet-500/20 p-4">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-violet-400 to-purple-600">
            CHATHOLA
          </h1>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowProfile(true)}
              className="flex items-center gap-2 px-4 py-2 bg-gray-700/50 hover:bg-gray-600/50 text-white rounded-lg transition-all"
            >
              <User size={20} />
              <span className="hidden sm:inline">Profile</span>
            </button>
            <button
              onClick={signOut}
              className="flex items-center gap-2 px-4 py-2 bg-gray-700/50 hover:bg-gray-600/50 text-white rounded-lg transition-all"
            >
              <LogOut size={20} />
              <span className="hidden sm:inline">Sign Out</span>
            </button>
          </div>
        </div>
      </header>

      <div className="flex-1 flex overflow-hidden">
        {/* Sidebar */}
        <div className="w-80 bg-gray-800/30 backdrop-blur-sm border-r border-violet-500/20 hidden md:flex flex-col">
          {/* Tabs */}
          <div className="flex border-b border-violet-500/20">
            <button
              onClick={() => setActiveTab('users')}
              className={`flex-1 p-4 flex items-center justify-center gap-2 transition-all ${
                activeTab === 'users'
                  ? 'bg-violet-500/20 text-white border-b-2 border-violet-500'
                  : 'text-gray-400 hover:text-white hover:bg-violet-500/10'
              }`}
            >
              <MessageSquare size={20} />
              <span>Chats</span>
            </button>
            <button
              onClick={() => setActiveTab('groups')}
              className={`flex-1 p-4 flex items-center justify-center gap-2 transition-all ${
                activeTab === 'groups'
                  ? 'bg-violet-500/20 text-white border-b-2 border-violet-500'
                  : 'text-gray-400 hover:text-white hover:bg-violet-500/10'
              }`}
            >
              <Users size={20} />
              <span>Groups</span>
            </button>
          </div>

          {/* List Content */}
          <div className="flex-1 overflow-hidden">
            {activeTab === 'users' ? (
              <UserList selectedUserId={selectedUserId} onSelectUser={handleSelectUser} />
            ) : (
              <GroupList
                selectedGroupId={selectedGroupId}
                onSelectGroup={handleSelectGroup}
                onCreateGroup={() => setShowCreateGroup(true)}
              />
            )}
          </div>
        </div>

        {/* Main Chat Area */}
        <div className="flex-1">
          {activeTab === 'users' ? (
            <ChatWindow selectedUserId={selectedUserId} selectedUserName={selectedUserName} />
          ) : (
            <GroupChatWindow selectedGroupId={selectedGroupId} selectedGroupName={selectedGroupName} />
          )}
        </div>
      </div>

      {/* Modals */}
      {showProfile && <Profile onClose={() => setShowProfile(false)} />}
      {showCreateGroup && (
        <CreateGroup
          onClose={() => setShowCreateGroup(false)}
          onGroupCreated={handleGroupCreated}
        />
      )}
    </div>
  );
};